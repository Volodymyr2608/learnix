import { DECODERS } from "./decoders";

export type NormalizedText = {
	normalized: string;
	decodedSegments: string[];
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

/**
 * base64 lives in the decoder registry with the other encodings; this layer's
 * job is only to normalize what it returns. Decoded segments are matched
 * directly, so they need the same folding as the top-level text — otherwise
 * base64 combined with a homoglyph substitution slips past both.
 */
const decodeBase64Segments = (text: string): string[] => {
	const base64 = DECODERS.find((decoder) => decoder.id === "base64");
	if (!base64) return [];
	return base64.decode(text).map(foldForMatching);
};

export const normalizeForMatching = (text: string): NormalizedText => ({
	normalized: foldForMatching(text),
	// Candidates are located in the RAW text: normalizing first could alter the
	// base64 alphabet and break detection.
	decodedSegments: decodeBase64Segments(text),
});
