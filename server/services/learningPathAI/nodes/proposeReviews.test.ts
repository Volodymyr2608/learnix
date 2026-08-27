import { describe, expect, it } from "vitest";
import type { PathState } from "../learningPathAI.state";
import { proposeReviews } from "./proposeReviews.node";

const weak = (concept: string, level: number, firstLessonId: string) => ({
	concept,
	level,
	firstLessonId,
});

const state = (over: Partial<PathState>): PathState =>
	({
		weakConcepts: [],
		failedQuizzes: [],
		...over,
	}) as PathState;

describe("proposeReviews", () => {
	it("reports mastery against the real ceiling, not an invented one", () => {
		const { candidateSteps } = proposeReviews(
			state({ weakConcepts: [weak("Recursion", 2, "lesson-1")] }),
		);

		// Mastery runs 0-3: conversation grants at most 2, quizzes write 3.
		// The seed reached the model — and the student — claiming a 5-point scale.
		expect(candidateSteps?.[0]?.reasonSeed).toBe(
			'Mastery of "Recursion" is 2/3 — review recommended',
		);
	});

	it("proposes at most three reviews", () => {
		const { candidateSteps } = proposeReviews(
			state({
				weakConcepts: [
					weak("A", 1, "l1"),
					weak("B", 1, "l2"),
					weak("C", 1, "l3"),
					weak("D", 1, "l4"),
				],
			}),
		);

		expect(candidateSteps).toHaveLength(3);
	});

	it("proposes one review per lesson, even when several concepts point at it", () => {
		const { candidateSteps } = proposeReviews(
			state({
				weakConcepts: [weak("A", 1, "same"), weak("B", 2, "same")],
			}),
		);

		expect(candidateSteps).toHaveLength(1);
	});
});
