import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REPLY_VALIDATION_RULE_IDS } from "./types";

/**
 * The output boundary's rule vocabulary, pinned to the documents that describe
 * it.
 *
 * `flowContract.contract.test.ts` already fails when a tool or a step module
 * exists with no station row — but it pins *existence*, not *content*. It could
 * not see the drift this test exists for: `concept_check_answer_echo` shipped as
 * the boundary's fifth rule while station 19, `spec.md` and `security.md` all
 * went on saying "four rules in fixed precedence". Three tracked documents
 * describing a four-rule boundary that has five is the same class
 * `docFigures.contract.test.ts` closed for eval figures, one layer over.
 *
 * The two halves compose, and only together:
 *
 * - **Code → vocabulary** is a compile-time property, not an assertion here.
 *   `ReplyValidationRuleId` is *derived* from `REPLY_VALIDATION_RULE_IDS`, so a
 *   sixth rule cannot be returned by `validateReply` without being added to the
 *   array first. Same mechanism, same reason, as `RULE_ID_VOCABULARY`
 *   (`_shared/aiGuard/patterns/index.ts`) and `DECODER_ID_VOCABULARY`
 *   (`_shared/aiGuard/decoders.ts`).
 * - **Vocabulary → documents** is what this file asserts.
 *
 * Deliberately NOT asserted: that each id appears in `validateReply.ts` itself.
 * `off_origin_link` is never written there as a literal — it arrives through
 * `shared.ruleId` from the shared boundary — so that check would fail on correct
 * code and teach the next reader to weaken it.
 */

const DOCS = [
	"docs/specs/features/ai-tutor-guardrails/flow-contract.md",
	"docs/specs/features/ai-tutor-guardrails/spec.md",
	"docs/specs/features/ai-tutor-guardrails/security.md",
] as const;

/**
 * Anchored to a code span, not a bare substring. Rule ids are underscored words
 * that read as prose fragments, and a document that merely happens to contain
 * the characters has not described the rule.
 */
const documented = (text: string, ruleId: string): boolean =>
	new RegExp(`\`${ruleId}\``).test(text);

describe("the output boundary's rule vocabulary is documented", () => {
	it("has every rule the boundary can report", () => {
		// Guards the reader: an empty vocabulary would make every assertion below
		// pass while checking nothing at all.
		expect(REPLY_VALIDATION_RULE_IDS.length).toBeGreaterThan(0);
	});

	it.each(DOCS)("%s names every rule id", (path) => {
		const text = readFileSync(path, "utf-8");
		const missing = REPLY_VALIDATION_RULE_IDS.filter(
			(ruleId) => !documented(text, ruleId),
		);

		expect(
			missing,
			`${path} describes the output boundary without naming the rules above. ` +
				"A rule the code can report and the document does not mention is the " +
				"drift this test exists to catch.",
		).toEqual([]);
	});
});
