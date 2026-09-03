import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { aiMetricsHandler } from "@/server/services/_shared/aiMetrics/handler";
import { projectError } from "./projectError";

/**
 * Task 9 (S9 / AC 19 / AC 20 / AC 41): the three AI catch sites this task
 * touches must (a) hand `logger.error`/`logger.debug` the REAL error so
 * `projectError` can read its class — not a `{ ..., err }` wrapper, whose
 * `constructor.name` is `"Object"` and loses the class for triage — (b) never
 * pass a model client, agent, chain, or graph-state object, and (c) never log
 * a client abort at all.
 *
 * `lessonAI.service.ts` and `withNodeErrors.ts` are exercised behaviourally,
 * mocking `@/server/utils/logger` the way `withNodeErrors.test.ts` already
 * does. `app/api/chat/course/route.ts` is a Next.js route handler that pulls
 * in the session, Prisma and the whole courseAI graph — too heavy to drive
 * end to end here — so its site is verified by a source scan over the call
 * text, the idiom `aiLimits.contract.test.ts` already uses for this kind of
 * shape assertion.
 */

// `@/server/utils/logger` is mocked ONCE for the whole file — vi.mock is
// module-wide per test file, so both the withNodeErrors block and the
// lessonAI.service block below share this one mock and clear only the calls
// they care about before each of their own assertions.
const { mockLogger } = vi.hoisted(() => ({
	mockLogger: {
		error: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	},
}));
vi.mock("@/server/utils/logger", () => ({ logger: mockLogger }));

// ---------------------------------------------------------------------------
// withNodeErrors.ts — courseAI graph node failure
// ---------------------------------------------------------------------------

const { withNodeErrors } = await import(
	"@/server/services/courseAI/graph/withNodeErrors"
);

const graphState = {} as never;

describe("withNodeErrors node-failure log (AC 19 / AC 20 / S9)", () => {
	it("downgrades the node-failure log off `error` so the SSE route's catch is the sole report (S9)", async () => {
		mockLogger.error.mockClear();
		mockLogger.debug.mockClear();

		const node = withNodeErrors("chat_response", async () => {
			throw Object.assign(new Error("SECRET_PROVIDER_PAYLOAD"), {
				name: "ProviderBoom",
			});
		});

		await expect(node(graphState)).rejects.toBeInstanceOf(Error);
		expect(mockLogger.error).not.toHaveBeenCalled();
		expect(mockLogger.debug).toHaveBeenCalledTimes(1);
	});

	it("logs the failing error's class only, never its message (AC 19)", async () => {
		mockLogger.debug.mockClear();
		const marker = "SECRET_PROVIDER_PAYLOAD_MARKER";

		const node = withNodeErrors("chat_response", async () => {
			throw Object.assign(new Error(marker), { name: "ProviderBoom" });
		});

		await expect(node(graphState)).rejects.toBeInstanceOf(Error);

		const [fields] = mockLogger.debug.mock.calls[0] ?? [];
		expect(JSON.stringify(fields)).not.toContain(marker);
		// The class survives as a scalar even though the raw error is gone.
		expect(JSON.stringify(fields)).toContain("ProviderBoom");
	});

	it("never passes a model client, agent, chain, or graph-state object (AC 20)", async () => {
		mockLogger.debug.mockClear();

		const node = withNodeErrors("chat_response", async () => {
			throw new TypeError("boom");
		});

		await expect(node(graphState)).rejects.toBeInstanceOf(Error);

		const [fields] = mockLogger.debug.mock.calls[0] ?? [];
		// Every value logged at this site must be a primitive scalar — the raw
		// `err`/`state` object (and therefore anything nested under it, such as
		// a ChatOpenAI client's apiKey field) is never a value in this payload.
		for (const value of Object.values(fields as Record<string, unknown>)) {
			expect(typeof value === "object").toBe(false);
		}
	});

	it("does not log a client abort at all (AC 41)", async () => {
		mockLogger.error.mockClear();
		mockLogger.debug.mockClear();

		const abort = Object.assign(new Error("Model invocation was aborted."), {
			name: "ModelAbortError",
		});
		const node = withNodeErrors("chat_response", async () => {
			throw abort;
		});

		await expect(node(graphState)).rejects.toBe(abort);
		expect(mockLogger.error).not.toHaveBeenCalled();
		expect(mockLogger.debug).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// lessonAI.service.ts — mid-stream provider error
// ---------------------------------------------------------------------------

const {
	mockSaveMessage,
	mockGetContextMessages,
	mockFindByLessonId,
	mockStreamEvents,
	mockMarkContextIneligible,
} = vi.hoisted(() => ({
	mockSaveMessage: vi.fn().mockResolvedValue({}),
	mockGetContextMessages: vi.fn().mockResolvedValue([]),
	mockFindByLessonId: vi.fn().mockResolvedValue(null),
	mockStreamEvents: vi.fn(),
	mockMarkContextIneligible: vi.fn().mockResolvedValue(undefined),
}));

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
// OpenAIEmbeddings is pulled in transitively via the agent's RAG tools.
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

describe("lessonAI.service.ts mid-stream-error log (AC 19 / AC 20 / AC 41)", () => {
	it("logs the real error, not a wrapping object, so projectError reports its true class (AC 19 / AC 20)", async () => {
		mockLogger.error.mockClear();
		const marker = "SECRET_PROVIDER_PAYLOAD_MARKER";
		mockStreamEvents.mockReturnValue(
			(async function* () {
				yield tokenEvent("partial reply");
				throw Object.assign(new Error(marker), { name: "ProviderBoom" });
			})(),
		);

		await drive();

		expect(mockLogger.error).toHaveBeenCalledTimes(1);
		const [loggedError, message] = mockLogger.error.mock.calls[0] ?? [];
		// Error-first, like guardUserInput.ts:103 — not `{ feature, err }`.
		expect(loggedError).toBeInstanceOf(Error);
		expect(typeof message).toBe("string");

		// The oracle: projectError must recover the real class, not "Object".
		const { root } = projectError(loggedError, "test");
		expect(root.name).toBe("ProviderBoom");
	});

	it("never lets the static log message carry the error's own text (AC 19)", async () => {
		mockLogger.error.mockClear();
		const marker = "SECRET_PROVIDER_PAYLOAD_MARKER";
		mockStreamEvents.mockReturnValue(
			(async function* () {
				yield tokenEvent("partial reply");
				throw new Error(marker);
			})(),
		);

		await drive();

		const [, message] = mockLogger.error.mock.calls[0] ?? [];
		expect(message as string).not.toContain(marker);
	});

	it("does not log a client abort at all (AC 41)", async () => {
		mockLogger.error.mockClear();
		const controller = new AbortController();
		mockStreamEvents.mockReturnValue(
			(async function* () {
				yield tokenEvent("partial reply");
				controller.abort();
				throw Object.assign(new Error("aborted"), { name: "AbortError" });
			})(),
		);

		await drive(controller.signal);

		expect(mockLogger.error).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// app/api/chat/course/route.ts — the sole surviving error-level report for a
// courseAI graph failure once withNodeErrors.ts is downgraded (S9).
// Exercised by source scan: the route pulls in the session, Prisma and the
// whole courseAI graph, too heavy to drive end to end from a contract test.
// ---------------------------------------------------------------------------

const routeSource = readFileSync("app/api/chat/course/route.ts", "utf8");

/** The argument text between `logger.error(` and the given static message. */
const callArgsBefore = (source: string, marker: string): string => {
	const markerIndex = source.indexOf(marker);
	if (markerIndex === -1) throw new Error(`marker not found: ${marker}`);
	const callStart = source.lastIndexOf("logger.error(", markerIndex);
	if (callStart === -1) {
		throw new Error(`no logger.error( call before marker: ${marker}`);
	}
	return source.slice(callStart, markerIndex);
};

describe("app/api/chat/course/route.ts stream-failed log (source scan, AC 19 / AC 20)", () => {
	it("passes the real error, not a `{ ..., err }` wrapper, to logger.error", () => {
		const callArgs = callArgsBefore(routeSource, '"[courseAI] stream failed"');
		// An object-literal wrapper (`{ feature, err: e }`) is exactly the shape
		// that loses the real error's class to projectError's `constructor.name`
		// fallback of "Object" — so no `{` may appear before the message.
		expect(callArgs).not.toContain("{");
	});

	it("does not pass a model client, agent, chain, or graph-state identifier (AC 20)", () => {
		const callArgs = callArgsBefore(routeSource, '"[courseAI] stream failed"');
		expect(callArgs).not.toMatch(/\bstate\b|\bagent\b|\bchain\b|\bclient\b/i);
	});
});
