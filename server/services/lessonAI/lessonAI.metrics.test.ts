import { beforeEach, describe, expect, it, vi } from "vitest";
import { aiMetricsHandler } from "@/server/services/_shared/aiMetrics/handler";

const {
	mockLogger,
	mockSaveMessage,
	mockGetContextMessages,
	mockFindByLessonId,
	mockStreamEvents,
	mockMarkContextIneligible,
} = vi.hoisted(() => ({
	mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
	mockSaveMessage: vi.fn().mockResolvedValue({ id: "row-1" }),
	mockGetContextMessages: vi.fn().mockResolvedValue([]),
	mockFindByLessonId: vi.fn().mockResolvedValue(null),
	mockStreamEvents: vi.fn(),
	mockMarkContextIneligible: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/server/utils/logger", () => ({ logger: mockLogger }));
vi.mock("@/server/repositories/lessonAssistant.repository", () => ({
	lessonAssistantRepository: {
		saveMessage: mockSaveMessage,
		getContextMessages: mockGetContextMessages,
		markContextIneligible: mockMarkContextIneligible,
	},
}));
vi.mock("@/server/repositories/lessonInsights.repository", () => ({
	lessonInsightsRepository: { findByLessonId: mockFindByLessonId },
}));
vi.mock(
	"@/server/services/lessonAI/lessonAI.agent",
	async (importOriginal) => ({
		...(await importOriginal<object>()),
		createLessonAgent: () => ({ streamEvents: mockStreamEvents }),
	}),
);
vi.mock("@langchain/openai", () => ({
	ChatOpenAI: class {},
	OpenAIEmbeddings: class {
		embedQuery() {
			return Promise.resolve([]);
		}
		embedDocuments() {
			return Promise.resolve([]);
		}
	},
}));

const { lessonAIService } = await import(
	"@/server/services/lessonAI/lessonAI.service"
);

/**
 * spec.md AC 3 / AC 5 / AC 8 / AC 9. The tutor has more exits than any other
 * flow here — an in-loop abort check, a catch, a finally that survives consumer
 * abandonment, a retraction and a normal completion — which is why the summary
 * is asserted from several of them rather than only the happy path.
 */

const tokenEvent = (value: string) => ({
	event: "on_chat_model_stream",
	metadata: { langgraph_node: "model_request" },
	data: { chunk: { content: value } },
});

const baseParams = {
	lessonId: "lesson-1",
	lessonTitle: "Recursion",
	courseTitle: "Algorithms",
	courseId: "course-1",
	studentId: "student-1",
	userMessage: "explain the base case",
};

const drive = async (signal?: AbortSignal) => {
	const events: unknown[] = [];
	for await (const event of lessonAIService.streamResponse({
		...baseParams,
		signal,
		metrics: aiMetricsHandler({ feature: "lessonAI" }),
	})) {
		events.push(event);
	}
	return events;
};

const turnLines = () =>
	mockLogger.info.mock.calls
		.map(([fields]) => fields as Record<string, unknown>)
		.filter((f) => "calls" in f);

beforeEach(() => {
	mockLogger.info.mockClear();
	mockLogger.error.mockClear();
	mockStreamEvents.mockReset();
});

describe("the handler reaches the agent (AC 3)", () => {
	it("passes a callbacks array without dropping the existing bounds", async () => {
		mockStreamEvents.mockReturnValue(
			(async function* () {
				yield tokenEvent("hello");
			})(),
		);

		await drive();

		const [, config] = mockStreamEvents.mock.calls[0] ?? [];
		expect(Array.isArray((config as { callbacks?: unknown }).callbacks)).toBe(
			true,
		);
		// recursionLimit is the agent's existing resource control; a config
		// rebuilt around callbacks could silently drop it.
		expect(config).toMatchObject({
			version: "v2",
			recursionLimit: expect.any(Number),
		});
	});
});

describe("one summary per turn, from whichever exit is taken (AC 5, AC 8)", () => {
	it("emits exactly one summary on a normal turn", async () => {
		mockStreamEvents.mockReturnValue(
			(async function* () {
				yield tokenEvent("hello");
			})(),
		);

		await drive();

		expect(turnLines()).toHaveLength(1);
		expect(turnLines()[0]).toMatchObject({ feature: "lessonAI" });
	});

	it("emits a summary with outcome aborted, and no error line (AC 8)", async () => {
		const controller = new AbortController();
		mockStreamEvents.mockReturnValue(
			(async function* () {
				yield tokenEvent("partial");
				controller.abort();
				yield tokenEvent("more");
			})(),
		);

		await drive(controller.signal);

		expect(turnLines()).toHaveLength(1);
		expect(turnLines()[0]?.outcome).toBe("aborted");
		expect(mockLogger.error).not.toHaveBeenCalled();
	});

	it("emits a summary when a provider error kills the stream", async () => {
		mockStreamEvents.mockReturnValue(
			(async function* () {
				yield tokenEvent("partial");
				throw Object.assign(new Error("upstream"), { name: "TimeoutError" });
			})(),
		);

		await drive();

		expect(turnLines()).toHaveLength(1);
		expect(turnLines()[0]?.outcome).toBe("retryable_error");
	});

	it("emits exactly one summary when the consumer abandons the generator", async () => {
		// The route breaks its for-await the moment the signal trips. That unwinds
		// the generator from its suspended yield, skipping every statement in the
		// loop — `finally` is the only construct that still runs.
		mockStreamEvents.mockReturnValue(
			(async function* () {
				yield tokenEvent("a");
				yield tokenEvent("b");
			})(),
		);

		for await (const _ of lessonAIService.streamResponse({
			...baseParams,
			metrics: aiMetricsHandler({ feature: "lessonAI" }),
		})) {
			break;
		}

		expect(turnLines()).toHaveLength(1);
	});
});

describe("the meter cannot break the turn it measures (AC 9)", () => {
	it("completes the turn and returns its tokens with a logger that always throws", async () => {
		mockLogger.info.mockImplementation(() => {
			throw new Error("sink is down");
		});
		mockStreamEvents.mockReturnValue(
			(async function* () {
				yield tokenEvent("still ");
				yield tokenEvent("delivered");
			})(),
		);

		const events = await drive();

		const text = events
			.filter(
				(e): e is { type: "token"; value: string } =>
					(e as { type?: string }).type === "token",
			)
			.map((e) => e.value)
			.join("");
		expect(text).toBe("still delivered");

		mockLogger.info.mockReset();
	});
});
