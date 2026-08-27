import { describe, expect, it } from "vitest";
import { CATEGORIES, JUDGED_CATEGORIES } from "./tutorDataset";

/**
 * Which categories the judge is asked about, and which it is not.
 *
 * A judge is asked only where quality is genuinely a judgement. The boundary
 * categories — role-change, reveal-instructions, prompt-injection, tool-abuse —
 * already have a correct answer an assertion can state, so paying a larger
 * model to re-read them buys nothing and adds noise to a number that is
 * currently exact.
 *
 * Note the gated categories ARE judged. Judging and gating are not alternatives:
 * `valid` rows are where faithfulness matters most, and excluding them would
 * discard the most useful scores in the set. What keeps AC 5 true is not that
 * the lists are disjoint — it is that `categoryGate` is only ever handed
 * deterministic results, which the types enforce.
 */
describe("judged categories", () => {
	it("asks the judge only about categories whose quality is a judgement", () => {
		expect([...JUDGED_CATEGORIES].sort()).toEqual([
			"ambiguous",
			"hallucination-bait",
			"low-confidence",
			"missing-info",
			"valid",
			"valid-reworded",
		]);
	});

	it("does not judge the categories an assertion already settles", () => {
		for (const category of [
			"role-change",
			"reveal-instructions",
			"prompt-injection",
			"tool-abuse",
			"off-topic",
			"conflicting-context",
		]) {
			expect(JUDGED_CATEGORIES).not.toContain(category);
		}
	});

	it("names only categories that exist", () => {
		for (const category of JUDGED_CATEGORIES) {
			expect(CATEGORIES).toContain(category);
		}
	});
});
