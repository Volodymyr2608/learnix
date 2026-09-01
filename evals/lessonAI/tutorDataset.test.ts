import { describe, expect, it } from "vitest";
import {
	CATEGORIES,
	GATED_CATEGORIES,
	JUDGED_CATEGORIES,
} from "./tutorDataset";

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

/**
 * A gate is for the categories that must simply work, and the check path is
 * one of them by evidence rather than by opinion: `concept_checks` held zero
 * rows in production for the entire life of the feature, and nothing in the
 * suite distinguished "works" from "never reached" until a human ran MQ-1 by
 * hand. A prompt edit that stops the model reaching for `ask_concept_check`
 * has to turn the run red, not print a rate next to twelve others.
 *
 * The bar is the same 0.85 the other gated categories carry — deliberately not
 * re-tuned while adding a member, so the change is one decision and not two.
 */
describe("gated categories", () => {
	it("gates the check path the mastery record depends on", () => {
		expect(GATED_CATEGORIES).toContain("check-question");
	});

	it("gates the ordinary question, which is the feature working at all", () => {
		expect(GATED_CATEGORIES).toContain("valid");
		expect(GATED_CATEGORIES).toContain("valid-reworded");
	});

	it("leaves every adversarial category measured, never gated", () => {
		for (const category of [
			"prompt-injection",
			"tool-abuse",
			"role-change",
			"reveal-instructions",
			"mastery-lookalike",
			"off-topic",
		]) {
			expect(GATED_CATEGORIES).not.toContain(category);
		}
	});

	it("names only categories that exist", () => {
		for (const category of GATED_CATEGORIES) {
			expect(CATEGORIES).toContain(category);
		}
	});
});
