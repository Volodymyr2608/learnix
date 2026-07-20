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

const foldHomoglyphs = (text: string): string =>
	text.replace(/./gu, (ch) => HOMOGLYPHS[ch] ?? ch);

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
				segments.push(decoded);
			}
		} catch {
			// not valid base64 — ignore
		}
	}
	return segments;
};

export const normalizeForMatching = (text: string): NormalizedText => {
	const normalized = foldHomoglyphs(
		text.normalize("NFKC").replace(ZERO_WIDTH, ""),
	);
	return { normalized, decodedSegments: decodeBase64Segments(text) };
};
