import { describe, expect, it } from "vitest";
import type { PathState } from "../learningPathAI.state";
import { proposeReviews } from "./proposeReviews.node";

const weak = (
	concept: string,
	evidence: "encountered" | "applied",
	firstLessonId: string,
) => ({ concept, evidence, firstLessonId });

const state = (over: Partial<PathState>): PathState =>
	({
		weakConcepts: [],
		failedQuizzes: [],
		...over,
	}) as PathState;

describe("proposeReviews", () => {
	/**
	 * The seed reaches the model AND the student, in the path's reason text. A
	 * bare numeric scale was wrong for both: "2/3" means nothing outside this
	 * codebase, and it also misdescribed what the row recorded.
	 */
	it("renders no bare numeric scale for either kind of evidence", () => {
		const { candidateSteps } = proposeReviews(
			state({
				weakConcepts: [
					weak("Recursion", "applied", "lesson-1"),
					weak("API Routes", "encountered", "lesson-2"),
				],
			}),
		);

		for (const step of candidateSteps ?? []) {
			expect(step.reasonSeed).not.toMatch(/\d\s*\/\s*\d/);
			expect(step.reasonSeed).not.toMatch(/level \d/i);
		}
	});

	it("says which of the two things the student actually did", () => {
		const { candidateSteps } = proposeReviews(
			state({
				weakConcepts: [
					weak("Recursion", "applied", "lesson-1"),
					weak("API Routes", "encountered", "lesson-2"),
				],
			}),
		);

		expect(candidateSteps?.[0]?.reasonSeed).toContain(
			"answered correctly once",
		);
		expect(candidateSteps?.[1]?.reasonSeed).toContain("has not been checked");
	});

	it("proposes at most three reviews", () => {
		const { candidateSteps } = proposeReviews(
			state({
				weakConcepts: [
					weak("A", "encountered", "l1"),
					weak("B", "encountered", "l2"),
					weak("C", "encountered", "l3"),
					weak("D", "encountered", "l4"),
				],
			}),
		);

		expect(candidateSteps).toHaveLength(3);
	});

	it("proposes one review per lesson, even when several concepts point at it", () => {
		const { candidateSteps } = proposeReviews(
			state({
				weakConcepts: [
					weak("A", "encountered", "same"),
					weak("B", "applied", "same"),
				],
			}),
		);

		expect(candidateSteps).toHaveLength(1);
	});
});
