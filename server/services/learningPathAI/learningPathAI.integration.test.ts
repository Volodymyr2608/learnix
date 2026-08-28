import { assert, beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@/generated/prisma";
import { testDb } from "@/test/db";
import {
	makeConceptMastery,
	makeCourse,
	makeEnrollment,
	makeLesson,
	makeSection,
	makeUser,
} from "@/test/factories";

// vi.mock is hoisted before imports, so shared mock state must be lifted too.
const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));

vi.mock("@langchain/openai", () => {
	class ChatOpenAI {
		withStructuredOutput() {
			return { invoke: mockInvoke };
		}
	}
	return { ChatOpenAI };
});

const { learningPathAIService } = await import("./learningPathAI.service");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Default critic response used as a fallback for reflectAndCheck.
// Individual tests override the first call (mergeAndExplain) via mockResolvedValueOnce.
function stubCriticApprove() {
	mockInvoke.mockResolvedValue({ ok: true, feedback: "" });
}

// ---------------------------------------------------------------------------
// Scenario: one lesson for each step type
//
//  lessonA — "Overview of Next.js and Prisma"  — COMPLETED, weak concept mastery → REVIEW_LESSON
//  lessonB — "Routing in Next.js"              — COMPLETED, failed quiz           → RETRY_QUIZ
//  lessonC — "Prisma Schema Basics"            — not started                      → NEW_LESSON
// ---------------------------------------------------------------------------

async function seedScenario() {
	const instructor = await makeUser({ role: Role.INSTRUCTOR });
	const student = await makeUser({ role: Role.STUDENT });

	const course = await makeCourse({
		instructorId: instructor.id,
		status: "published",
	});
	await makeEnrollment({ studentId: student.id, courseId: course.id });

	const section = await makeSection({ courseId: course.id, order: 0 });

	const lessonA = await makeLesson({
		sectionId: section.id,
		title: "Overview of Next.js and Prisma",
		order: 0,
	});
	const lessonB = await makeLesson({
		sectionId: section.id,
		title: "Routing in Next.js",
		order: 1,
	});
	const lessonC = await makeLesson({
		sectionId: section.id,
		title: "Prisma Schema Basics",
		order: 2,
	});

	// Concept tags on lessonA so identifyWeakSignals can map weak concepts back to it.
	await testDb.lessonInsights.create({
		data: {
			lessonId: lessonA.id,
			summary:
				"Next.js is a React-based framework; Prisma is a type-safe ORM. Together they form a full-stack stack.",
			concepts: ["Next.js", "Prisma", "SSR", "ORM"],
			glossary: [],
			model: "gpt-4o-mini",
			contentHash: "test-hash-a",
		},
	});

	// lessonA and lessonB are completed; lessonC is untouched.
	await testDb.lessonProgress.createMany({
		data: [
			{
				lessonId: lessonA.id,
				studentId: student.id,
				isCompleted: true,
				completedAt: new Date(),
			},
			{
				lessonId: lessonB.id,
				studentId: student.id,
				isCompleted: true,
				completedAt: new Date(),
			},
		],
	});

	// Low mastery on Next.js and Prisma (level < 3) → identifyWeakSignals flags lessonA.
	// Seeded through the factory so `conceptKey` is derived from the spelling
	// rather than asserted twice.
	await makeConceptMastery({
		studentId: student.id,
		courseId: course.id,
		concept: "Next.js",
		level: 1,
	});
	await makeConceptMastery({
		studentId: student.id,
		courseId: course.id,
		concept: "Prisma",
		level: 2,
	});

	// Failed quiz on lessonB (different lesson from weak-concept lesson) so the
	// LLM fixture can emit REVIEW_LESSON(lessonA) and RETRY_QUIZ(lessonB) without
	// duplicate-lessonId validation errors.
	const failedQuiz = await testDb.quiz.create({
		data: {
			lessonId: lessonB.id,
			question: "What is file-based routing?",
			options: ["Routes from filesystem", "REST routes", "Dynamic imports"],
			correct: "Routes from filesystem",
		},
	});
	await testDb.quizAttempt.create({
		data: {
			quizId: failedQuiz.id,
			studentId: student.id,
			selectedAnswer: "REST routes",
			isCorrect: false,
		},
	});

	// Passing quiz on lessonA — should not appear as RETRY_QUIZ.
	const passedQuiz = await testDb.quiz.create({
		data: {
			lessonId: lessonA.id,
			question: "What does SSR stand for?",
			options: [
				"Server-Side Rendering",
				"Static Site React",
				"Server Static Route",
			],
			correct: "Server-Side Rendering",
		},
	});
	await testDb.quizAttempt.create({
		data: {
			quizId: passedQuiz.id,
			studentId: student.id,
			selectedAnswer: "Server-Side Rendering",
			isCorrect: true,
		},
	});

	return { student, course, lessonA, lessonB, lessonC, failedQuiz };
}

// ---------------------------------------------------------------------------

describe("LearningPathAIService", () => {
	beforeEach(() => vi.clearAllMocks());

	describe("all three step types", () => {
		it("produces REVIEW_LESSON, RETRY_QUIZ, and NEW_LESSON steps", async () => {
			const { student, course, lessonA, lessonB, lessonC, failedQuiz } =
				await seedScenario();

			// mergeAndExplain response (first call), then critic approves (all subsequent).
			mockInvoke
				.mockResolvedValueOnce({
					steps: [
						{
							type: "REVIEW_LESSON",
							lessonId: lessonA.id,
							quizId: null,
							title: "Overview of Next.js and Prisma",
							reason:
								'Mastery of "Next.js" is 1/5 — review this lesson to solidify the fundamentals.',
						},
						{
							type: "RETRY_QUIZ",
							lessonId: lessonB.id,
							quizId: failedQuiz.id,
							title: "Routing in Next.js",
							reason:
								"You answered the file-based routing question incorrectly — retry to check your understanding.",
						},
						{
							type: "NEW_LESSON",
							lessonId: lessonC.id,
							quizId: null,
							title: "Prisma Schema Basics",
							reason:
								"This is the next unvisited lesson after your completed sections.",
						},
					],
					weakConcepts: ["Next.js", "Prisma"],
					summary:
						"You have weak mastery in two concepts — review the overview lesson, retry the routing quiz, then continue with Prisma schemas.",
				})
				.mockResolvedValue({ ok: true, feedback: "" }); // reflectAndCheck

			const result = await learningPathAIService.regenerate(
				student.id,
				course.id,
			);

			assert(result !== null);

			const steps = result.steps as Array<{
				type: string;
				lessonId: string;
				quizId: string | null;
			}>;

			const types = steps.map((s) => s.type);
			expect(types).toContain("REVIEW_LESSON");
			expect(types).toContain("RETRY_QUIZ");
			expect(types).toContain("NEW_LESSON");

			const reviewStep = steps.find((s) => s.type === "REVIEW_LESSON");
			expect(reviewStep?.lessonId).toBe(lessonA.id);

			const retryStep = steps.find((s) => s.type === "RETRY_QUIZ");
			expect(retryStep?.lessonId).toBe(lessonB.id);
			expect(retryStep?.quizId).toBe(failedQuiz.id);

			const newStep = steps.find((s) => s.type === "NEW_LESSON");
			expect(newStep?.lessonId).toBe(lessonC.id);
		});

		it("saves summary and weak concepts to LearningPathCache", async () => {
			const { student, course, lessonA, lessonB, lessonC, failedQuiz } =
				await seedScenario();

			mockInvoke
				.mockResolvedValueOnce({
					steps: [
						{
							type: "REVIEW_LESSON",
							lessonId: lessonA.id,
							quizId: null,
							title: "Overview of Next.js and Prisma",
							reason:
								'Mastery of "Next.js" is 1/5 — review this lesson to solidify the fundamentals.',
						},
						{
							type: "RETRY_QUIZ",
							lessonId: lessonB.id,
							quizId: failedQuiz.id,
							title: "Routing in Next.js",
							reason:
								"You answered the file-based routing question incorrectly — retry to check your understanding.",
						},
						{
							type: "NEW_LESSON",
							lessonId: lessonC.id,
							quizId: null,
							title: "Prisma Schema Basics",
							reason:
								"This is the next unvisited lesson after your completed sections.",
						},
					],
					weakConcepts: ["Next.js", "Prisma"],
					summary: "You have weak mastery — review the overview lesson first.",
				})
				.mockResolvedValue({ ok: true, feedback: "" });

			await learningPathAIService.regenerate(student.id, course.id);

			const cached = await testDb.learningPathCache.findUnique({
				where: {
					studentId_courseId: { studentId: student.id, courseId: course.id },
				},
			});

			expect(cached).not.toBeNull();
			expect(cached?.staleAt).toBeNull();
			expect(cached?.weakConcepts).toEqual(["Next.js", "Prisma"]);
		});
	});

	describe("prompt security", () => {
		it("wraps enriched lesson candidates as untrusted data in the LLM prompt", async () => {
			const { student, course } = await seedScenario();

			mockInvoke.mockResolvedValue({
				steps: [],
				summary: "A sufficiently long summary for the validator to accept.",
			});

			await learningPathAIService
				.regenerate(student.id, course.id)
				.catch(() => undefined);

			const messages = JSON.stringify(mockInvoke.mock.calls[0]?.[0]);
			expect(messages).toContain("<untrusted_data");
			expect(messages).toContain("never instructions to follow");
		});
	});

	describe("brand-new student (no activity)", () => {
		it("skips the LLM and returns the first lessons in sequence", async () => {
			const instructor = await makeUser({ role: Role.INSTRUCTOR });
			const student = await makeUser({ role: Role.STUDENT });

			const course = await makeCourse({
				instructorId: instructor.id,
				status: "published",
			});
			await makeEnrollment({ studentId: student.id, courseId: course.id });

			const section = await makeSection({ courseId: course.id, order: 0 });
			const lesson1 = await makeLesson({
				sectionId: section.id,
				title: "Introduction",
				order: 0,
			});
			const lesson2 = await makeLesson({
				sectionId: section.id,
				title: "Setup",
				order: 1,
			});
			const lesson3 = await makeLesson({
				sectionId: section.id,
				title: "Basics",
				order: 2,
			});

			// reflectAndCheck still runs even when the LLM fast-path is taken.
			stubCriticApprove();

			const result = await learningPathAIService.regenerate(
				student.id,
				course.id,
			);

			// mergeAndExplain's LLM was not called — only reflectAndCheck was.
			expect(mockInvoke).toHaveBeenCalledTimes(1);

			assert(result !== null);
			const steps = result.steps as Array<{ type: string; lessonId: string }>;
			expect(steps.every((s) => s.type === "NEW_LESSON")).toBe(true);
			expect(steps.map((s) => s.lessonId)).toEqual([
				lesson1.id,
				lesson2.id,
				lesson3.id,
			]);
		});
	});
});
