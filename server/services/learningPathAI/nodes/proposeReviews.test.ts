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

	/**
	 * `weakConcepts` is now derived from every concept of every completed lesson,
	 * grouped lesson by lesson, so the first entries all share a lesson. Taking
	 * the first three and THEN deduplicating by lesson collapsed the whole list
	 * to a single review step for any student whose first completed lesson had
	 * three concepts — which is most of them. The dedupe has to run while
	 * walking the list, not after a slice of it.
	 */
	it("spreads reviews across lessons rather than stopping at the first", () => {
		const { candidateSteps } = proposeReviews(
			state({
				weakConcepts: [
					weak("Recursion", "encountered", "lesson-1"),
					weak("Base case", "encountered", "lesson-1"),
					weak("Stack frame", "encountered", "lesson-1"),
					weak("API Routes", "encountered", "lesson-2"),
					weak("Server Components", "encountered", "lesson-3"),
				],
			}),
		);

		const lessonIds = (candidateSteps ?? []).map((step) => step.lessonId);
		expect(lessonIds).toEqual(["lesson-1", "lesson-2", "lesson-3"]);
	});

	it("still proposes at most three reviews", () => {
		const { candidateSteps } = proposeReviews(
			state({
				weakConcepts: [
					weak("A", "encountered", "lesson-1"),
					weak("B", "encountered", "lesson-2"),
					weak("C", "encountered", "lesson-3"),
					weak("D", "encountered", "lesson-4"),
				],
			}),
		);

		expect(candidateSteps).toHaveLength(3);
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

		expect(candidateSteps?.[0]?.reasonSeed).toContain("partly demonstrated");
		expect(candidateSteps?.[1]?.reasonSeed).toContain("has not been checked");
	});

	/**
	 * `applied` is derived from level alone — any row below 3 — so it covers rows
	 * whose `evidence` is `LEGACY` or `CONVERSATION`, written before a check
	 * existed and, in the CONVERSATION case, on a student's say-so. Text claiming
	 * they "answered correctly once" is false for exactly the population this
	 * feature was built to stop overclaiming about, and it is student-facing.
	 */
	it("claims no answer the row may not record", () => {
		const { candidateSteps } = proposeReviews(
			state({ weakConcepts: [weak("Recursion", "applied", "lesson-1")] }),
		);

		expect(candidateSteps?.[0]?.reasonSeed).not.toMatch(/answered correctly/i);
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
