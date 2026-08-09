export type NormalizedText = {
	normalized: string;
	decodedSegments: string[];
};

const ZERO_WIDTH = /[​-‏﻿⁠-⁤]/g;

/**
 * NFKC does NOT fold these — they are distinct code points, not compatibility
 * variants — so they need an explicit map.
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
};

const BASE64_CANDIDATE = /[A-Za-z0-9+/]{16,}={0,2}/g;
const MOSTLY_PRINTABLE = 0.9;

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
 * Only base64 is decoded, single-pass. ROT13, hex, URL-encoding, leetspeak and
 * nested/double encodings are deliberately NOT decoded here: L1 is a
 * deterministic pre-filter, and an encoded payload it misses still faces L2 and
 * L3, while the model rarely obeys an instruction it had to decode itself. Each
 * added decoder needs its own printable/false-positive guard and measured
 * dataset rows to be an honest claim of coverage. See security.md S13 §29.
 */
const decodeBase64Segments = (text: string): string[] => {
	const segments: string[] = [];
	for (const match of text.matchAll(BASE64_CANDIDATE)) {
		const candidate = match[0];
		try {
			const decoded = Buffer.from(candidate, "base64").toString("utf-8");
			if (decoded.length === 0) continue;
			const printable = [...decoded].filter((c) => {
				const code = c.codePointAt(0) ?? 0;
				return code >= 0x20 && code <= 0x7e;
			}).length;
			if (printable / decoded.length >= MOSTLY_PRINTABLE) {
				// Decoded segments are matched directly, so they need the same
				// folding as the top-level text — otherwise base64 + homoglyph
				// combined slips past both.
				segments.push(foldForMatching(decoded));
			}
		} catch {
			// not valid base64 — ignore
		}
	}
	return segments;
};

export const normalizeForMatching = (text: string): NormalizedText => ({
	normalized: foldForMatching(text),
	// Candidates are located in the RAW text: normalizing first could alter the
	// base64 alphabet and break detection.
	decodedSegments: decodeBase64Segments(text),
});
