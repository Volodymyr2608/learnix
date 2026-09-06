import { describe, expect, it } from "vitest";
import { DECODERS } from "./decoders";
import { detectInjection } from "./detectInjection";
import { INJECTION_PATTERNS } from "./patterns";

/**
 * L1 runs synchronously in the request path before the first token, over the
 * union of every language set (security.md S7). MAX_MSG_LENGTH is 2000
 * (aiLimits/checkAiRateLimit.ts), so 2000 characters is the real worst case.
 *
 * The bound is generous on purpose — it is a catastrophic-backtracking alarm,
 * not a performance budget. A pattern that trips it is exponential, not slow.
 */
const BUDGET_MS = 50;
const MAX_LEN = 2000;

const pad = (seed: string): string =>
	seed.repeat(Math.ceil(MAX_LEN / seed.length)).slice(0, MAX_LEN);

/** The seed the existing English case uses, reused so the cases are comparable. */
const EN_NEAR_MATCH = "ignore the previous previous previous ";

const rot13Of = (text: string): string =>
	text.replace(/[a-z]/gi, (char) => {
		const base = char <= "Z" ? 65 : 97;
		return String.fromCharCode(((char.charCodeAt(0) - base + 13) % 26) + base);
	});

const LEET_OF: Record<string, string> = { o: "0", i: "1", e: "3", s: "5" };
const leetOf = (text: string): string =>
	text.replace(/[oies]/g, (char) => LEET_OF[char] ?? char);

const reverseOf = (text: string): string => [...text].reverse().join("");

/** Cyrillic and Greek lookalikes for every Latin letter the fold table covers. */
const HOMOGLYPH_OF: Record<string, string> = {
	a: "а",
	e: "е",
	o: "о",
	p: "р",
	c: "с",
	i: "і",
	s: "ѕ",
	v: "ν",
};
const homoglyphOf = (text: string): string =>
	text.replace(/[aeopcisv]/g, (char) => HOMOGLYPH_OF[char] ?? char);

const PATHOLOGICAL: [string, string][] = [
	[
		"near-match English override",
		pad("ignore the previous previous previous "),
	],
	[
		"near-match Spanish override",
		pad("ignora las instrucciones instrucciones "),
	],
	["near-match French override", pad("ignore les instructions instructions ")],
	["near-match German override", pad("ignoriere die vorherigen vorherigen ")],
	["repeated word chars", pad("a")],
	["repeated separators", pad("- ")],
	["repeated angle brackets", pad("<system ")],
	["repeated colons", pad("system: ")],
	["base64-looking filler", pad("QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=")],
	// A decoder multiplies the work every pattern does, so the worst case is a
	// near-match that only APPEARS after decoding — the raw view is innocent and
	// the expensive one is the string the catalogue never used to see.
	["rot13 of a near-match override", pad(rot13Of(EN_NEAR_MATCH))],
	["leetspeak near-match override", pad(leetOf(EN_NEAR_MATCH))],
	["reversed near-match override", pad(reverseOf(EN_NEAR_MATCH))],
	["homoglyph-saturated near-match override", pad(homoglyphOf(EN_NEAR_MATCH))],
];

/**
 * A pathological case that decodes to nothing tests nothing: it would sit in
 * the array forever looking like decoder coverage while exercising only the raw
 * view. Each seed above must actually reach the catalogue through its decoder.
 */
describe("the decoder seeds above are not inert", () => {
	it.each([
		["rot13", rot13Of(EN_NEAR_MATCH)],
		["leetspeak", leetOf(EN_NEAR_MATCH)],
		["reversed", reverseOf(EN_NEAR_MATCH)],
	])("%s decodes back to the near-match", (id, seed) => {
		const decoder = DECODERS.find((entry) => entry.id === id);
		expect(decoder?.decode(seed)).toEqual([EN_NEAR_MATCH]);
	});

	it("every seed makes the raw view innocent and the decoded view the work", () => {
		for (const seed of [
			rot13Of(EN_NEAR_MATCH),
			leetOf(EN_NEAR_MATCH),
			reverseOf(EN_NEAR_MATCH),
		]) {
			expect(seed).not.toContain("ignore");
		}
	});
});

describe("detectInjection — no catastrophic backtracking (AC-10)", () => {
	it.each(PATHOLOGICAL)("stays within budget: %s", (_name, text) => {
		const started = performance.now();
		detectInjection(text);
		expect(performance.now() - started).toBeLessThan(BUDGET_MS);
	});

	it("uses only bounded quantifiers in every pattern", () => {
		// Unbounded + or * inside a group that can also match via an alternative
		// is the shape that goes exponential. Bounded {0,N} gaps are the house
		// convention and are what keeps the English rules linear today.
		for (const pattern of INJECTION_PATTERNS) {
			expect(
				pattern.regex.source,
				`${pattern.id} contains a nested unbounded quantifier`,
			).not.toMatch(/\([^)]*[+*]\)[+*]/);
		}
	});
});
