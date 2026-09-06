import { DECODERS, type DecoderId } from "./decoders";

/**
 * How a view of the message was obtained, when it was not the message itself.
 *
 * `"normalization"` covers homoglyph folding, zero-width stripping and NFKC
 * together, deliberately without saying which — they are one pass and the code
 * cannot honestly attribute between them. Naming it is still worth more than
 * silence: it separates "arrived with lookalike or invisible characters" from
 * "typed out in ASCII", which is the distinction the telemetry exists for.
 */
export type Obfuscation = DecoderId | "normalization";

/**
 * One view of the message for the catalogue to be matched against, labelled
 * with what produced it.
 *
 * `"raw"` is the message **exactly as sent** — deliberately not normalized. That
 * is load-bearing rather than incidental: `\b` is ASCII-only and every rule ends
 * in one, so a Greek or Cyrillic code point is a word boundary before folding
 * and a word character after it. Folding in place therefore *destroys* matches
 * (`instructionsι` folds to `instructionsi`, and `\binstructions\b` stops
 * matching), which made the fold table an evasion alphabet rather than a
 * defence. Keeping the unfolded view is what makes normalization additive, as it
 * always claimed to be. Pinned by `normalize.contract.test.ts`.
 */
export type Haystack = {
	source: Obfuscation | "raw";
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
 * Exported for `normalize.contract.test.ts`, which asserts that inserting any of
 * them never scores below the unnormalized text. A table entry is a potential
 * evasion character, so the test has to enumerate the real table rather than a
 * copy that can drift from it.
 */
export const FOLDED_CODE_POINTS = Object.keys(HOMOGLYPHS);

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
	const normalized = foldForMatching(text);

	// The unfolded original first, so a rule that folding would have broken still
	// matches. Everything after it is additive by construction.
	const haystacks: Haystack[] = [{ source: "raw", text }];
	const seen = new Set([text]);

	const add = (source: Haystack["source"], candidate: string): void => {
		// A view already held contributes nothing but a second pass over the whole
		// catalogue. Note the consequence for attribution: where two sources
		// produce the same string, only the first is credited.
		if (candidate.length === 0 || seen.has(candidate)) return;
		seen.add(candidate);
		haystacks.push({ source, text: candidate });
	};

	add("normalization", normalized);

	for (const decoder of DECODERS) {
		// Decoders see the NORMALIZED text, not the original: the zero-width and
		// NFKC controls are older than this registry, and feeding a decoder around
		// them would let one invisible character disable it. base64 is the
		// exception it declares — normalizing first can alter the base64 alphabet
		// and break the decode outright.
		const input = decoder.consumesRawText ? text : normalized;
		for (const decoded of decoder.decode(input)) {
			add(decoder.id, foldForMatching(decoded));
		}
	}

	return { haystacks };
};
