import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { MasteryEvidence } from "@/generated/prisma";
import { lessonInsightsRepository } from "@/server/repositories/lessonInsights.repository";
import type { PathState } from "@/server/services/learningPathAI/learningPathAI.state";
import { identifyWeakSignals } from "@/server/services/learningPathAI/nodes/identifyWeakSignals.node";
import { proposeReviews } from "@/server/services/learningPathAI/nodes/proposeReviews.node";
import { testDb, truncateAll } from "@/test/db";
import {
	makeConceptMastery,
	makeCourse,
	makeLesson,
	makeSection,
	makeUser,
} from "@/test/factories";

const pathState = (overrides: Partial<PathState>): PathState =>
	({
		completedLessonIds: [],
		mastery: [],
		lessonOrder: [],
		quizAttempts: [],
		...overrides,
	}) as PathState;

/**
 * Pins a decision, not a change: `upsertByLessonId` writes to `lesson_insights`
 * and nothing else, so an LLM rewording a heading cannot destroy evidence a
 * student earned. The row it no longer matches goes inert — it can produce no
 * review step — but it is retained, and only a person can decide it is wrong.
 *
 * The opposite behaviour is the tempting one (regeneration "cleans up" mastery
 * rows that no longer correspond to a concept), and it is silent, irreversible
 * and triggered by a model. This test exists so that adding it requires deleting
 * an assertion that says why not.
 */
describe("regenerating lesson insights preserves earned mastery", () => {
	let studentId: string;
	let courseId: string;
	let lessonId: string;

	beforeEach(async () => {
		await truncateAll();
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		const student = await makeUser();
		const course = await makeCourse({ instructorId: instructor.id });
		const section = await makeSection({ courseId: course.id });
		const lesson = await makeLesson({ sectionId: section.id });

		studentId = student.id;
		courseId = course.id;
		lessonId = lesson.id;

		await lessonInsightsRepository.upsertByLessonId(lessonId, {
			summary: "Routing in Next.js",
			concepts: [{ name: "API Routes" }],
			glossary: [],
			model: "gpt-test",
			contentHash: "hash-1",
		});

		await makeConceptMastery({
			studentId,
			courseId,
			concept: "API Routes",
			level: 2,
			evidence: MasteryEvidence.CONVERSATION,
		});
	});

	afterAll(async () => {
		await testDb.$disconnect();
	});

	it("leaves the mastery row untouched when every concept is renamed", async () => {
		await lessonInsightsRepository.upsertByLessonId(lessonId, {
			summary: "Routing in Next.js",
			concepts: [{ name: "Route Handlers" }],
			glossary: [],
			model: "gpt-test",
			contentHash: "hash-2",
		});

		const rows = await testDb.conceptMastery.findMany({ where: { studentId } });
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			concept: "API Routes",
			conceptKey: "api routes",
			level: 2,
			evidence: MasteryEvidence.CONVERSATION,
		});
	});

	it("makes the orphaned row inert: it produces no review step", async () => {
		await lessonInsightsRepository.upsertByLessonId(lessonId, {
			summary: "Routing in Next.js",
			concepts: [{ name: "Route Handlers" }],
			glossary: [],
			model: "gpt-test",
			contentHash: "hash-2",
		});

		const insights = await lessonInsightsRepository.findByLessonId(lessonId);
		const result = identifyWeakSignals(
			pathState({
				completedLessonIds: [lessonId],
				mastery: [{ concept: "API Routes", level: 2 }],
				lessonOrder: [
					{
						id: lessonId,
						title: "Lesson 1",
						sectionOrder: 1,
						lessonOrder: 1,
						concepts: (insights?.concepts ?? []).map((c) => c.name),
					},
				],
			}),
		);

		// The row survives the rename — evidence the student earned is not
		// destroyed because a model reworded a heading — but it is inert: with no
		// lesson to point at, it yields no review step. The lesson's NEW concept
		// is weak by encounter, which is a different fact and a real one.
		expect(result.weakConcepts).toContainEqual({
			concept: "API Routes",
			evidence: "applied",
			firstLessonId: "",
		});

		const { candidateSteps } = proposeReviews(
			pathState({
				weakConcepts: result.weakConcepts ?? [],
				failedQuizzes: [],
			}),
		);
		expect(candidateSteps?.filter((step) => step.lessonId === "")).toEqual([]);
	});

	it("still produces a review step for a concept the rename kept", async () => {
		// The counterweight: "no review step" must be a consequence of the rename,
		// not of the reader being broken.
		await lessonInsightsRepository.upsertByLessonId(lessonId, {
			summary: "Routing in Next.js",
			concepts: [{ name: "api  routes" }, { name: "Route Handlers" }],
			glossary: [],
			model: "gpt-test",
			contentHash: "hash-3",
		});

		const insights = await lessonInsightsRepository.findByLessonId(lessonId);
		const result = identifyWeakSignals(
			pathState({
				completedLessonIds: [lessonId],
				mastery: [{ concept: "API Routes", level: 2 }],
				lessonOrder: [
					{
						id: lessonId,
						title: "Lesson 1",
						sectionOrder: 1,
						lessonOrder: 1,
						concepts: (insights?.concepts ?? []).map((c) => c.name),
					},
				],
			}),
		);

		expect(result.weakConcepts).toContainEqual({
			concept: "API Routes",
			evidence: "applied",
			firstLessonId: lessonId,
		});

		const { candidateSteps } = proposeReviews(
			pathState({
				weakConcepts: result.weakConcepts ?? [],
				failedQuizzes: [],
			}),
		);
		expect(candidateSteps?.some((step) => step.lessonId === lessonId)).toBe(
			true,
		);
	});
});
