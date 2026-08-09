import { beforeEach, describe, expect, it, vi } from "vitest";
import { NEUTRAL_REFUSAL_MESSAGE } from "@/server/services/_shared/aiGuard/messages";

const {
	mockSaveMessage,
	mockGetContextMessages,
	mockFindByLessonId,
	mockStreamEvents,
} = vi.hoisted(() => ({
	mockSaveMessage: vi.fn().mockResolvedValue({}),
	mockGetContextMessages: vi.fn().mockResolvedValue([]),
	mockFindByLessonId: vi.fn().mockResolvedValue(null),
	mockStreamEvents: vi.fn(),
}));

vi.mock("@/server/repositories/lessonAssistant.repository", () => ({
	lessonAssistantRepository: {
		saveMessage: mockSaveMessage,
		getContextMessages: mockGetContextMessages,
	},
}));
vi.mock("@/server/repositories/lessonInsights.repository", () => ({
	lessonInsightsRepository: { findByLessonId: mockFindByLessonId },
}));
vi.mock("./lessonAI.agent", async (importOriginal) => ({
	...(await importOriginal<object>()),
	createLessonAgent: () => ({ streamEvents: mockStreamEvents }),
}));
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

const { lessonAIService } = await import("./lessonAI.service");

const tokenEvent = (value: string) => ({
	event: "on_chat_model_stream",
	metadata: { langgraph_node: "model_request" },
	data: { chunk: { content: value } },
});

const streamOf = (events: unknown[]) =>
	(async function* () {
		for (const event of events) yield event;
	})();

const collect = async (events: unknown[]) => {
	mockStreamEvents.mockReturnValue(streamOf(events));
	const out: { type: string; message?: string; value?: string }[] = [];
	for await (const event of lessonAIService.streamResponse({
		lessonId: "lesson-1",
		lessonTitle: "Recursion",
		courseTitle: "Algorithms",
		courseId: "course-1",
		studentId: "student-1",
		userMessage: "explain the base case",
	})) {
		out.push(event as { type: string });
	}
	return out;
};

describe("streamResponse output boundary", () => {
	beforeEach(() => {
		mockSaveMessage.mockClear();
	});

	it("persists a clean reply exactly once and never retracts", async () => {
		const events = await collect([
			tokenEvent("A base case stops the recursion."),
		]);

		expect(events.map((e) => e.type)).not.toContain("retract");
		expect(mockSaveMessage).toHaveBeenCalledTimes(1);
	});

	it("retracts and persists nothing when the reply leaks the system prompt", async () => {
		const events = await collect([
			tokenEvent("Sure — Tool usage rules (follow in order): "),
		]);

		const retract = events.find((e) => e.type === "retract");
		expect(retract?.message).toBe(NEUTRAL_REFUSAL_MESSAGE);
		expect(mockSaveMessage).not.toHaveBeenCalled();
	});

	it("captures tool output as a bare string for the verbatim check", async () => {
		const chunk =
			"Recursion terminates at the base case, which is the smallest input the function can answer directly without calling itself again.";
		const events = await collect([
			{
				event: "on_tool_end",
				name: "retrieve_lesson_context",
				data: { output: chunk },
			},
			tokenEvent(chunk),
		]);

		expect(events.some((e) => e.type === "retract")).toBe(true);
		expect(mockSaveMessage).not.toHaveBeenCalled();
	});

	it("captures tool output wrapped in a ToolMessage for the verbatim check", async () => {
		const chunk =
			"Recursion terminates at the base case, which is the smallest input the function can answer directly without calling itself again.";
		const events = await collect([
			{
				event: "on_tool_end",
				name: "retrieve_lesson_context",
				data: { output: { content: chunk } },
			},
			tokenEvent(chunk),
		]);

		expect(events.some((e) => e.type === "retract")).toBe(true);
	});
});
