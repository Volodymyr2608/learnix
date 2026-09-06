import { DECODERS, type DecoderId } from "./decoders";

/**
 * One view of the message for the catalogue to be matched against, labelled
 * with what produced it. `"raw"` is the message itself after normalization;
 * every other source is a decoder.
 *
 * The label is not decoration: it is what lets a security event say whether an
 * attack arrived in plaintext or obfuscated, which is the difference between
 * someone guessing and someone working the problem.
 */
export type Haystack = {
	source: DecoderId | "raw";
	text: string;
};

export type NormalizedText = {
	haystacks: Haystack[];
};

const ZERO_WIDTH = /[​-‏﻿⁠-⁤]/g;

/**
 * NFKC does NOT fold these — they are distinct code points, not compatibility
 * variants — so they need an explicit map.
 *
 * Entries are lowercase only; `foldHomoglyphs` lowercases, looks up, and
 * restores case, so each line covers its capital too.
 *
 * **What is deliberately absent, and why the table is not "every confusable".**
 * Only single-codepoint lookalikes whose glyph is near-identical to the Latin
 * letter are folded. `β γ ε ζ η μ` are excluded: their shapes are distinct from
 * `b y e z n u`, and they are precisely the letters a statistics or ML course
 * uses as itself (`ε`-greedy, `β`-VAE, `μ`/`σ`). Folding them would put ordinary
 * course content through a transform for no measured recall gain. Pinned in
 * normalize.test.ts so the exclusion is a decision rather than an omission.
 */
const HOMOGLYPHS: Record<string, string> = {
	а: "a", // Cyrillic а
	е: "e", // Cyrillic е
	о: "o", // Cyrillic о
	р: "p", // Cyrillic р
	с: "c", // Cyrillic с
	х: "x", // Cyrillic х
	у: "y", // Cyrillic у
	і: "i", // Cyrillic і
	ο: "o", // Greek ο
	α: "a", // Greek α
	ι: "i", // Greek ι
	ν: "v", // Greek ν
	κ: "k", // Greek κ
	ρ: "p", // Greek ρ
	τ: "t", // Greek τ
	υ: "u", // Greek υ
	χ: "x", // Greek χ
	ѕ: "s", // Cyrillic ѕ (dze)
	ј: "j", // Cyrillic ј
	һ: "h", // Cyrillic һ (shha)
	ԁ: "d", // Cyrillic ԁ (Komi de)
	ӏ: "l", // Cyrillic ӏ (palochka)
	ԛ: "q", // Cyrillic ԛ (qa)
	ԝ: "w", // Cyrillic ԝ (we)
};

/**
 * Case-aware: the map holds only lowercase code points, but the uppercase
 * variants are distinct code points that NFKC does not fold either. Looking up
 * the lowercased char and restoring the original case covers both without
 * enumerating every capital — and keeps `normalized` a case-preserving view of
 * the input.
 */
const foldHomoglyphs = (text: string): string =>
	text.replace(/./gu, (ch) => {
		const direct = HOMOGLYPHS[ch];
		if (direct) return direct;
		const lower = ch.toLowerCase();
		const folded = HOMOGLYPHS[lower];
		if (!folded) return ch;
		return ch === lower ? folded : folded.toUpperCase();
	});

/** The full matching pipeline, applied to the input and to decoded segments alike. */
const foldForMatching = (text: string): string =>
	foldHomoglyphs(text.normalize("NFKC").replace(ZERO_WIDTH, ""));

export const normalizeForMatching = (text: string): NormalizedText => {
	// Candidates are located in the RAW text: normalizing first could alter the
	// base64 alphabet and break detection.
	const raw = foldForMatching(text);
	const haystacks: Haystack[] = [{ source: "raw", text: raw }];
	const seen = new Set([raw]);

	for (const decoder of DECODERS) {
		for (const decoded of decoder.decode(text)) {
			const folded = foldForMatching(decoded);
			// A decoder that reproduces a view we already hold contributes nothing
			// but a second pass over the whole catalogue.
			if (folded.length === 0 || seen.has(folded)) continue;
			seen.add(folded);
			haystacks.push({ source: decoder.id, text: folded });
		}
	}

	return { haystacks };
};
