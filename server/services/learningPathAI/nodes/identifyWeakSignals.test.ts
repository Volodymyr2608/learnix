import { describe, expect, it } from "vitest";
import type { PathState } from "../learningPathAI.state";
import {
	identifyWeakSignals,
	MAX_WEAK_CONCEPTS,
} from "./identifyWeakSignals.node";

const state = (overrides: Partial<PathState>): PathState =>
	({
		completedLessonIds: [],
		mastery: [],
		lessonOrder: [],
		quizAttempts: [],
		...overrides,
	}) as PathState;

/** Only `id` and `concepts` matter here; the rest is shape the state requires. */
const lesson = (
	id: string,
	concepts: string[],
): PathState["lessonOrder"][number] => ({
	id,
	title: id,
	sectionOrder: 1,
	lessonOrder: 1,
	concepts,
});

describe("identifyWeakSignals", () => {
	it("matches a mastery row against a lesson concept spelled differently", () => {
		// The defect this closes: `toolPolicy` wrote the row after comparing
		// case-insensitively, and this node then looked it up with `.includes()`,
		// which is case- and whitespace-sensitive. The row simply never matched, and
		// a silent non-match reads as "nothing to review" rather than as an error.
		const result = identifyWeakSignals(
			state({
				completedLessonIds: ["lesson-1"],
				mastery: [{ concept: "API Routes", level: 2 }],
				lessonOrder: [lesson("lesson-1", ["api  routes"])],
			}),
		);

		expect(result.weakConcepts).toEqual([
			{
				concept: "API Routes",
				evidence: "applied",
				firstLessonId: "lesson-1",
			},
		]);
	});

	it("still matches an exact spelling", () => {
		const result = identifyWeakSignals(
			state({
				completedLessonIds: ["lesson-1"],
				mastery: [{ concept: "Recursion", level: 1 }],
				lessonOrder: [lesson("lesson-1", ["Recursion"])],
			}),
		);

		expect(result.weakConcepts).toHaveLength(1);
	});

	it("does not match a concept that merely contains the name", () => {
		// The shared rule must not quietly become a substring match: `C` is not
		// `C#`. The lesson's own `C#` is weak by encounter; the row for `C` finds
		// no lesson and stays an orphan.
		const result = identifyWeakSignals(
			state({
				completedLessonIds: ["lesson-1"],
				mastery: [{ concept: "C", level: 2 }],
				lessonOrder: [lesson("lesson-1", ["C#"])],
			}),
		);

		expect(result.weakConcepts).toContainEqual({
			concept: "C#",
			evidence: "encountered",
			firstLessonId: "lesson-1",
		});
		expect(
			result.weakConcepts?.find((w) => w.concept === "C")?.firstLessonId,
		).toBe("");
	});

	/**
	 * An insights regeneration can rename a concept out from under a row the
	 * student earned. The row is retained — destroying evidence because a model
	 * reworded a heading is the failure this guards — but it has no lesson to send
	 * anyone to, so it produces no review step.
	 */
	it("keeps a concept that belongs to no completed lesson, with no lesson to review", () => {
		const result = identifyWeakSignals(
			state({
				completedLessonIds: [],
				mastery: [{ concept: "API Routes", level: 2 }],
				lessonOrder: [lesson("lesson-1", ["API Routes"])],
			}),
		);

		expect(result.weakConcepts).toEqual([
			{ concept: "API Routes", evidence: "applied", firstLessonId: "" },
		]);
	});

	it("derives a completed lesson's concept as encountered when no row exists", () => {
		const result = identifyWeakSignals(
			state({
				completedLessonIds: ["lesson-1"],
				mastery: [],
				lessonOrder: [lesson("lesson-1", ["API Routes"])],
			}),
		);

		// The row this replaces used to be stored at level 1. Deriving it is what
		// made deleting those rows safe.
		expect(result.weakConcepts).toEqual([
			{
				concept: "API Routes",
				evidence: "encountered",
				firstLessonId: "lesson-1",
			},
		]);
	});

	it("does not derive concepts from a lesson the student has not completed", () => {
		const result = identifyWeakSignals(
			state({
				completedLessonIds: [],
				mastery: [],
				lessonOrder: [lesson("lesson-1", ["API Routes"])],
			}),
		);

		expect(result.weakConcepts).toEqual([]);
	});

	it("excludes a concept already at level 3, derived or not", () => {
		// The level-3 row must also displace the `encountered` entry the lesson
		// scan adds, or the student is told to review what they have demonstrably
		// mastered — this feature's own defect, reached from the other end.
		const result = identifyWeakSignals(
			state({
				completedLessonIds: ["lesson-1"],
				mastery: [{ concept: "API Routes", level: 3 }],
				lessonOrder: [lesson("lesson-1", ["API Routes"])],
			}),
		);

		expect(result.weakConcepts).toEqual([]);
	});

	it("takes the first completed lesson that teaches the concept", () => {
		const result = identifyWeakSignals(
			state({
				completedLessonIds: ["lesson-1", "lesson-2"],
				mastery: [{ concept: "API Routes", level: 2 }],
				lessonOrder: [
					lesson("lesson-1", ["Middleware"]),
					lesson("lesson-2", ["  api routes  "]),
				],
			}),
		);

		expect(
			result.weakConcepts?.find((w) => w.concept === "API Routes")
				?.firstLessonId,
		).toBe("lesson-2");
	});

	it("deduplicates failed quizzes by lesson", () => {
		const attemptedAt = new Date();
		const result = identifyWeakSignals(
			state({
				quizAttempts: [
					{ quizId: "q1", lessonId: "lesson-1", isCorrect: false, attemptedAt },
					{ quizId: "q2", lessonId: "lesson-1", isCorrect: false, attemptedAt },
					{ quizId: "q3", lessonId: "lesson-2", isCorrect: false, attemptedAt },
					{ quizId: "q4", lessonId: "lesson-3", isCorrect: true, attemptedAt },
				],
			}),
		);

		expect(result.failedQuizzes).toEqual([
			{ lessonId: "lesson-1", quizId: "q1" },
			{ lessonId: "lesson-2", quizId: "q3" },
		]);
	});

	/**
	 * The list is now derived from every concept of every completed lesson, so
	 * the sparse rows that record something the student DID would otherwise sit
	 * behind hundreds of bare "encountered" entries — past the cap, past the
	 * three reviews `proposeReviews` takes, and past anything the prompt shows.
	 */
	it("puts what the student did before what they merely saw", () => {
		const result = identifyWeakSignals(
			state({
				completedLessonIds: ["lesson-1", "lesson-2"],
				mastery: [{ concept: "Server Components", level: 2 }],
				lessonOrder: [
					lesson("lesson-1", ["Recursion", "Base case"]),
					lesson("lesson-2", ["Server Components"]),
				],
			}),
		);

		expect(result.weakConcepts?.[0]).toEqual({
			concept: "Server Components",
			evidence: "applied",
			firstLessonId: "lesson-2",
		});
	});

	/**
	 * `weakConcepts` is JSON.stringify'd into the merge prompt and again into
	 * every reflection retry. Before it was derived it was bounded by the number
	 * of persisted rows, which is small; a 40-lesson course at 5 concepts each
	 * now makes it 200 objects on every path generation, with no ceiling anyone
	 * chose.
	 */
	it("caps the derived list so it cannot grow with the course", () => {
		const lessons = Array.from({ length: 40 }, (_, i) =>
			lesson(
				`lesson-${i}`,
				Array.from({ length: 5 }, (_, c) => `Concept ${i}-${c}`),
			),
		);

		const result = identifyWeakSignals(
			state({
				completedLessonIds: lessons.map((l) => l.id),
				lessonOrder: lessons,
			}),
		);

		expect(result.weakConcepts?.length).toBe(MAX_WEAK_CONCEPTS);
	});
});
