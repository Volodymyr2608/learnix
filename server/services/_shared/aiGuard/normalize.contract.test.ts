import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectInjection } from "./detectInjection";
import { FOLDED_CODE_POINTS } from "./normalize";
import { INJECTION_PATTERNS, scoreMatches } from "./patterns";

/**
 * What L1 would score with no normalization at all — the floor the full
 * pipeline must never fall below.
 */
const unnormalizedScore = (text: string): number =>
	scoreMatches([text], INJECTION_PATTERNS).score;

/**
 * Normalization must be **additive**: the full pipeline may reveal a match the
 * unnormalized text does not have, and must never score *below* it.
 *
 * Stated against the unnormalized floor rather than against the un-spiked
 * payload, because inserting a character can legitimately break a rule's
 * required phrase in every view at once ("system prompt" → "systemι prompt")
 * — that is the payload changing, not normalization losing.
 *
 * This is the invariant `spec.md` asserted and nothing tested. It does not hold
 * for free, and the reason is subtle enough to be worth stating: JavaScript's
 * `\b` is ASCII-only, and every rule in the catalogue terminates in `\b`. A
 * Greek or Cyrillic code point is therefore a **non-word** character before
 * folding and a **word** character after it. Folding in place turns
 * `instructionsι` — which matches `\binstructions\b`, because `ι` is a boundary
 * — into `instructionsi`, which does not.
 *
 * Left unfixed, every entry in the fold table is an evasion character and the
 * table is the attacker's alphabet: one inserted code point took ten of the
 * twenty-seven injection rows out of `block`, two of them to score 0 — no
 * event at all. The fix is to keep the unfolded view as its own haystack, so
 * folding adds a view instead of rewriting the only one.
 */
const INJECTIONS = readFileSync(
	join(process.cwd(), "evals/datasets/aiGuard/adversarial.jsonl"),
	"utf-8",
)
	.split("\n")
	.filter(Boolean)
	.map((line) => JSON.parse(line) as { input: { text: string } })
	.filter((row) => detectInjection(row.input.text).verdict === "block")
	.map((row) => row.input.text);

/** Every position at the end of an ASCII word — where a `\b` can be broken. */
const wordEnds = (text: string): number[] => {
	const positions: number[] = [];
	for (const match of text.matchAll(/\w(?=\W|$)/g)) {
		positions.push((match.index ?? 0) + 1);
	}
	return positions;
};

describe("normalization is monotone in score", () => {
	it("has injection rows to work with", () => {
		expect(INJECTIONS.length).toBeGreaterThanOrEqual(27);
	});

	it.each(
		FOLDED_CODE_POINTS,
	)("inserting %s never scores below the unnormalized text", (codePoint) => {
		for (const text of INJECTIONS) {
			for (const at of wordEnds(text)) {
				const spiked = text.slice(0, at) + codePoint + text.slice(at);
				expect(detectInjection(spiked).score).toBeGreaterThanOrEqual(
					unnormalizedScore(spiked),
				);
			}
		}
	});

	/**
	 * The same hazard, from the other two normalization steps. Zero-width
	 * stripping joins `instructions<ZWSP>x` into `instructionsx`, and NFKC folds
	 * a fullwidth digit into an ASCII one — both convert a boundary into a word
	 * character exactly as homoglyph folding does.
	 */
	it.each([
		["zero-width space", "​"],
		["fullwidth digit", "１"],
	])("%s never scores below the unnormalized text", (_n, ch) => {
		for (const text of INJECTIONS) {
			for (const at of wordEnds(text)) {
				const spiked = text.slice(0, at) + ch + text.slice(at);
				expect(detectInjection(spiked).score).toBeGreaterThanOrEqual(
					unnormalizedScore(spiked),
				);
			}
		}
	});
});
