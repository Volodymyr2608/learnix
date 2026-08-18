import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLogSecurityEvent, mockInvoke } = vi.hoisted(() => ({
	mockLogSecurityEvent: vi.fn(),
	mockInvoke: vi.fn(),
}));

vi.mock("@/server/services/_shared/aiGuard/securityLog", () => ({
	logSecurityEvent: mockLogSecurityEvent,
}));

vi.mock("@langchain/openai", () => {
	class ChatOpenAI {
		withStructuredOutput() {
			return { invoke: mockInvoke };
		}
	}
	return { ChatOpenAI };
});

vi.mock("@/server/repositories/lessonInsights.repository", () => ({
	lessonInsightsRepository: { findByLessonId: vi.fn().mockResolvedValue(null) },
}));
vi.mock("@/server/repositories/lesson.repository", () => ({
	lessonRepository: { findFirst: vi.fn().mockResolvedValue(null) },
}));
vi.mock("@/server/repositories/quizAttempt.repository", () => ({
	quizAttemptRepository: { findMany: vi.fn().mockResolvedValue([]) },
}));

const { mergeAndExplain } = await import("./mergeAndExplain.node");

const state = {
	studentId: "student-1",
	courseId: "course-1",
	skipLLM: false,
	completedLessonIds: [],
	lessonOrder: [
		{ id: "l1", title: "One", sectionOrder: 0, lessonOrder: 0, concepts: [] },
	],
	quizAttempts: [],
	mastery: [],
	weakConcepts: [],
	failedQuizzes: [],
	candidateSteps: [
		{ type: "NEW_LESSON" as const, lessonId: "l1", reasonSeed: "seed" },
	],
	finalSteps: [],
	generatedWeakConcepts: [],
	summary: "",
	reflectionAttempt: 0,
} as never;

describe("mergeAndExplain's terminal fail-open (AC 31)", () => {
	beforeEach(() => {
		mockLogSecurityEvent.mockClear();
		mockInvoke.mockReset();
	});

	it("emits fallback_triggered before giving up, without changing the failure", async () => {
		// Every draft references a lesson outside the course, so all three attempts
		// fail semantic validation.
		mockInvoke.mockResolvedValue({
			steps: [
				{
					type: "NEW_LESSON",
					lessonId: "not-in-course",
					quizId: null,
					title: "x",
					reason: "a reason long enough to satisfy the schema",
				},
			],
			summary: "a summary long enough to satisfy the schema",
			weakConcepts: [],
		});

		await expect(mergeAndExplain(state)).rejects.toThrow(
			"Structured output failed semantic validation after 3 attempts",
		);

		expect(mockLogSecurityEvent).toHaveBeenCalledTimes(1);
		expect(mockLogSecurityEvent).toHaveBeenCalledWith({
			feature: "learningPathAI",
			userId: "student-1",
			layer: "model_call_fallback",
			outcome: "fallback_triggered",
			ruleIds: ["lesson_not_in_course"],
			score: 0,
			subject: { kind: "course", id: "course-1" },
		});
	});

	it("stays silent when a draft passes", async () => {
		mockInvoke.mockResolvedValue({
			steps: [
				{
					type: "NEW_LESSON",
					lessonId: "l1",
					quizId: null,
					title: "One",
					reason: "a reason long enough to satisfy the schema",
				},
			],
			summary: "a summary long enough to satisfy the schema",
			weakConcepts: [],
		});

		await expect(mergeAndExplain(state)).resolves.toMatchObject({
			summary: "a summary long enough to satisfy the schema",
		});
		expect(mockLogSecurityEvent).not.toHaveBeenCalled();
	});
});
