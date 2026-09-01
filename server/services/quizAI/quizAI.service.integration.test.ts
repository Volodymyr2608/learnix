import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@/generated/prisma";
import { lessonInsightsRepository } from "@/server/repositories/lessonInsights.repository";
import { testDb, truncateAll } from "@/test/db";
import {
	makeCourse,
	makeLesson,
	makeSection,
	makeUser,
} from "@/test/factories";

const { mockAgentInvoke, mockLogSecurityEvent, mockCreateAgent } = vi.hoisted(
	() => ({
		mockAgentInvoke: vi.fn(),
		mockLogSecurityEvent: vi.fn(),
		mockCreateAgent: vi.fn(),
	}),
);

vi.mock("@/server/services/_shared/aiGuard/securityLog", () => ({
	logSecurityEvent: mockLogSecurityEvent,
}));

vi.mock("@/server/services/quizAI/quizAI.agent", () => ({
	createQuizAgent: mockCreateAgent,
}));

const { quizAIService } = await import("./quizAI.service");

const question = (text: string, concept?: string) => ({
	question: text,
	options: ["a", "b", "c", "d"],
	correct: "a",
	// Always present: the response schema is strict, so the model cannot omit
	// the key — it says "untagged" with null.
	concept: concept ?? null,
});

const seed = async (concepts: string[]) => {
	const instructor = await makeUser({ role: Role.INSTRUCTOR });
	const course = await makeCourse({ instructorId: instructor.id });
	const section = await makeSection({ courseId: course.id });
	const lesson = await makeLesson({
		sectionId: section.id,
		content: "A lesson about recursion.",
	});

	if (concepts.length > 0) {
		await lessonInsightsRepository.upsertByLessonId(lesson.id, {
			summary: "Recursion",
			concepts: concepts.map((name) => ({ name })),
			glossary: [],
			model: "gpt-test",
			contentHash: "hash-1",
		});
	}

	return { instructor, lesson };
};

beforeEach(() => {
	mockAgentInvoke.mockReset();
	mockLogSecurityEvent.mockReset();
	mockCreateAgent.mockReset();
	mockCreateAgent.mockResolvedValue({ invoke: mockAgentInvoke });
});

afterEach(() => truncateAll());

describe("quizAI tags a generated question with the concept it tests", () => {
	it("keeps a concept drawn from the lesson's insights", async () => {
		const { instructor, lesson } = await seed(["Recursion", "Base Case"]);
		mockAgentInvoke.mockResolvedValue({
			structuredResponse: {
				questions: [
					question("What is recursion?", "Recursion"),
					question("What ends a recursion?", "Base Case"),
					question("What is a stack frame?", "Recursion"),
				],
			},
		});

		const result = await quizAIService.generateForLesson(
			lesson.id,
			3,
			instructor.id,
			true,
		);

		expect(result.map((q) => q.concept)).toEqual([
			"Recursion",
			"Base Case",
			"Recursion",
		]);
	});

	it("returns the allowlist spelling, not the model's", async () => {
		// The model is the caller here, and its spelling must not reach the column
		// the promotion query groups by.
		const { instructor, lesson } = await seed(["Base Case"]);
		mockAgentInvoke.mockResolvedValue({
			structuredResponse: {
				questions: [
					question("q1", "  base   case "),
					question("q2", "BASE CASE"),
					question("q3", "Base Case"),
				],
			},
		});

		const result = await quizAIService.generateForLesson(
			lesson.id,
			3,
			instructor.id,
			true,
		);

		expect(result.map((q) => q.concept)).toEqual([
			"Base Case",
			"Base Case",
			"Base Case",
		]);
	});

	it("drops a generated name that is outside the allowlist", async () => {
		const { instructor, lesson } = await seed(["Recursion"]);
		mockAgentInvoke.mockResolvedValue({
			structuredResponse: {
				questions: [
					question("q1", "Recursion"),
					question("q2", "Quantum Tunnelling"),
					question("q3", ""),
				],
			},
		});

		const result = await quizAIService.generateForLesson(
			lesson.id,
			3,
			instructor.id,
			true,
		);

		expect(result.map((q) => q.concept)).toEqual(["Recursion", null, null]);
	});

	it("tags nothing when the lesson has no insights at all", async () => {
		// An empty allowlist denies; it does not permit. The questions are still
		// generated — an untagged quiz keeps lesson-wide promotion (Task 6).
		const { instructor, lesson } = await seed([]);
		mockAgentInvoke.mockResolvedValue({
			structuredResponse: {
				questions: [
					question("q1", "Recursion"),
					question("q2", "Base Case"),
					question("q3", "Anything"),
				],
			},
		});

		const result = await quizAIService.generateForLesson(
			lesson.id,
			3,
			instructor.id,
			true,
		);

		expect(result.every((q) => q.concept === null)).toBe(true);
	});

	it("tags nothing for a request naming another instructor's lesson", async () => {
		const { lesson } = await seed(["Recursion"]);
		const outsider = await makeUser({ role: Role.INSTRUCTOR });
		mockAgentInvoke.mockResolvedValue({
			structuredResponse: {
				questions: [question("q1", "Recursion")],
			},
		});

		await expect(
			quizAIService.generateForLesson(lesson.id, 3, outsider.id, true),
		).rejects.toThrow();
		// The allowlist is read from the row the ownership query returned, so a
		// failed ownership check cannot reach one at all.
		expect(mockAgentInvoke).not.toHaveBeenCalled();
	});

	it("returns the stored tag when existing questions are reused", async () => {
		const { instructor, lesson } = await seed(["Recursion"]);
		await testDb.quiz.createMany({
			data: [
				{
					lessonId: lesson.id,
					question: "stored q1",
					options: ["a", "b", "c", "d"],
					correct: "a",
					concept: "Recursion",
				},
				{
					lessonId: lesson.id,
					question: "stored q2",
					options: ["a", "b", "c", "d"],
					correct: "a",
				},
			],
		});

		const result = await quizAIService.generateForLesson(
			lesson.id,
			3,
			instructor.id,
			false,
		);

		expect(mockAgentInvoke).not.toHaveBeenCalled();
		expect(result.map((q) => q.concept)).toEqual(["Recursion", null]);
	});
});
