import { beforeEach, describe, expect, it, vi } from "vitest";
import { NEUTRAL_REFUSAL_MESSAGE } from "@/server/services/_shared/aiGuard/messages";

const {
	mockSaveMessage,
	mockGetContextMessages,
	mockFindByLessonId,
	mockStreamEvents,
	mockValidateReply,
	mockLogSecurityEvent,
} = vi.hoisted(() => ({
	mockSaveMessage: vi.fn().mockResolvedValue({}),
	mockGetContextMessages: vi.fn().mockResolvedValue([]),
	mockFindByLessonId: vi.fn().mockResolvedValue(null),
	mockStreamEvents: vi.fn(),
	mockValidateReply: vi.fn(),
	mockLogSecurityEvent: vi.fn(),
}));

vi.mock("./validateReply", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./validateReply")>();
	mockValidateReply.mockImplementation(actual.validateReply);
	return { validateReply: mockValidateReply };
});
vi.mock("@/server/services/_shared/aiGuard/securityLog", () => ({
	logSecurityEvent: mockLogSecurityEvent,
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
		mockLogSecurityEvent.mockClear();
	});

	// Fail-closed: the spec says "the validator throwing counts as a rejection".
	// Without this test, someone adding a try/catch inside validateReply turns
	// the boundary fail-open with every other test still green.
	it("treats a throwing validator as a rejection", async () => {
		mockValidateReply.mockImplementationOnce(() => {
			throw new Error("boom");
		});

		const events = await collect([tokenEvent("A base case stops recursion.")]);

		const retract = events.find((e) => e.type === "retract");
		expect(retract?.message).toBe(NEUTRAL_REFUSAL_MESSAGE);
		expect(mockSaveMessage).not.toHaveBeenCalled();
		expect(mockLogSecurityEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				layer: "output_validation",
				outcome: "output_validation_failed",
				ruleIds: ["validator_error"],
			}),
		);
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

	// F3: retracting the reply leaves the same turn's mastery write in place
	// (it passed its own authorization and is not coupled to the reply text).
	// The retract is the strongest signal a turn was adversarial, so the retained
	// write is flagged for review — without lying about writes that never landed.
	const recorded = 'Recorded: "Recursion" at level 2 (applied).';

	const markConceptEnd = (output: string) => ({
		event: "on_tool_end",
		name: "mark_concept_understood",
		data: { output },
	});

	it("flags a committed mastery write retained on a retracted turn", async () => {
		const events = await collect([
			markConceptEnd(recorded),
			tokenEvent("Sure — Tool usage rules (follow in order): "),
		]);

		expect(events.some((e) => e.type === "retract")).toBe(true);
		expect(mockLogSecurityEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				feature: "lessonAI",
				layer: "output_validation",
				outcome: "mastery_write_retained",
			}),
		);
	});

	// Discriminating: a mark_concept call that toolPolicy DENIED returns the
	// neutral refusal and writes nothing, so no write was retained — the flag
	// must not fire, or the signal claims a write that never happened.
	it("does not flag when the mastery tool was denied on a retracted turn", async () => {
		await collect([
			markConceptEnd(NEUTRAL_REFUSAL_MESSAGE),
			tokenEvent("Sure — Tool usage rules (follow in order): "),
		]);

		expect(mockLogSecurityEvent).not.toHaveBeenCalledWith(
			expect.objectContaining({ outcome: "mastery_write_retained" }),
		);
	});

	// Discriminating: a committed write on a CLEAN turn is the normal path —
	// nothing is retracted and nothing is flagged.
	it("does not flag a committed mastery write when the reply is clean", async () => {
		const events = await collect([
			markConceptEnd(recorded),
			tokenEvent("A base case stops the recursion."),
		]);

		expect(events.some((e) => e.type === "retract")).toBe(false);
		expect(mockSaveMessage).toHaveBeenCalledTimes(1);
		expect(mockLogSecurityEvent).not.toHaveBeenCalledWith(
			expect.objectContaining({ outcome: "mastery_write_retained" }),
		);
	});
});
