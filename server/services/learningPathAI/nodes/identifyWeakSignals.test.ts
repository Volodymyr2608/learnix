import { describe, expect, it } from "vitest";
import type { PathState } from "../learningPathAI.state";
import { identifyWeakSignals } from "./identifyWeakSignals.node";

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
			{ concept: "API Routes", level: 2, firstLessonId: "lesson-1" },
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
		// `.includes()` on the array is exact-element, but the shared rule must not
		// quietly become a substring match either: `C` is not `C#`.
		const result = identifyWeakSignals(
			state({
				completedLessonIds: ["lesson-1"],
				mastery: [{ concept: "C", level: 1 }],
				lessonOrder: [lesson("lesson-1", ["C#"])],
			}),
		);

		expect(result.weakConcepts).toEqual([]);
	});

	it("drops a concept that belongs to no completed lesson", () => {
		const result = identifyWeakSignals(
			state({
				completedLessonIds: [],
				mastery: [{ concept: "API Routes", level: 2 }],
				lessonOrder: [lesson("lesson-1", ["API Routes"])],
			}),
		);

		expect(result.weakConcepts).toEqual([]);
	});

	it("excludes a concept already at level 3", () => {
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

		expect(result.weakConcepts?.[0]?.firstLessonId).toBe("lesson-2");
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
});
