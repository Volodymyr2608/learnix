/**
 * Additional views of one message, for L1 to match the pattern catalogue over.
 *
 * A decoder does not decide anything: it hands `detectInjection` another string
 * that the *same* unchanged catalogue is run against. That is the whole reason
 * this widening costs no false positives — a decoder adds a haystack, never a
 * weight, and the weight budget is what the legitimate corpus is close to
 * (`ai-guard-encoding-coverage/security.md` S3).
 *
 * **Homoglyph folding is deliberately NOT a decoder here.** It is normalization
 * applied to *every* haystack, decoded ones included — a base64 payload written
 * with Cyrillic lookalikes has to be folded after it is decoded, or the
 * combination slips past both. A peer decoder could only fold the top-level
 * text, so calling it one would misdescribe what the code does and break that
 * composition. It stays in `normalize.ts`, and it is therefore not in the
 * provenance vocabulary below.
 *
 * Each decoder returns zero or more strings. Returning `[]` is how a decoder
 * declines: either its guard rejected the input, or it had nothing to add.
 */

const ID = {
	base64: "base64",
	rot13: "rot13",
	leetspeak: "leetspeak",
	reversed: "reversed",
} as const;

/**
 * The closed vocabulary, derived from the id object rather than retyped beside
 * it, so a literal that is not a real decoder cannot type-check as a
 * `DecoderId`. Same mechanism and same reason as `RULE_ID_VOCABULARY`
 * (`patterns/index.ts`); a hand-authored second list is a source of truth that
 * will drift.
 */
export const DECODER_ID_VOCABULARY = Object.values(ID);

export type DecoderId = (typeof DECODER_ID_VOCABULARY)[number];

export type Decoder = {
	id: DecoderId;
	/** Pure and synchronous — L1 runs before the first token of every turn. */
	decode: (input: string) => string[];
	/**
	 * Set only by base64. Every other decoder is fed the NORMALIZED text so that
	 * zero-width and NFKC cannot be used to slip around it; base64 must see the
	 * original, because normalizing can rewrite characters inside the base64
	 * alphabet and break the decode outright.
	 */
	consumesRawText?: true;
};

const BASE64_CANDIDATE = /[A-Za-z0-9+/]{16,}={0,2}/g;
const MOSTLY_PRINTABLE = 0.9;

/**
 * The one decoder whose output can be arbitrary bytes, so the one that needs a
 * printable-ratio guard. Candidates are located in the RAW text: normalizing
 * first could alter the base64 alphabet and break detection.
 */
const decodeBase64 = (raw: string): string[] => {
	const segments: string[] = [];
	for (const match of raw.matchAll(BASE64_CANDIDATE)) {
		try {
			const decoded = Buffer.from(match[0], "base64").toString("utf-8");
			if (decoded.length === 0) continue;
			const printable = [...decoded].filter((char) => {
				const code = char.codePointAt(0) ?? 0;
				return code >= 0x20 && code <= 0x7e;
			}).length;
			if (printable / decoded.length >= MOSTLY_PRINTABLE)
				segments.push(decoded);
		} catch {
			// not valid base64 — ignore
		}
	}
	return segments;
};

/**
 * A printable-ratio guard would be vacuous for the three character transforms
 * below: they map printable input to printable output by construction, so such
 * a guard could never reject anything. What actually holds the false-positive
 * line for them is the catalogue itself — every rule requires a verb+object
 * *word* combination, and a character transform of ordinary prose does not
 * produce those words. Measured: 0 of 64 legitimate rows blocked
 * (`detectInjection.test.ts`).
 */
const rot13 = (raw: string): string[] => {
	if (raw.length === 0) return [];
	return [
		raw.replace(/[a-z]/gi, (char) => {
			const base = char <= "Z" ? 65 : 97;
			return String.fromCharCode(
				((char.charCodeAt(0) - base + 13) % 26) + base,
			);
		}),
	];
};

const LEET: Record<string, string> = {
	"0": "o",
	"1": "i",
	"3": "e",
	"4": "a",
	"5": "s",
	"7": "t",
	"@": "a",
	$: "s",
};

/**
 * Derived from the map, never retyped beside it. Written by hand, the class and
 * the map drift silently: adding `8: "b"` to the map would compile, pass, and do
 * nothing at all.
 */
const LEET_CLASS = `[${Object.keys(LEET)
	.map((char) => char.replace(/[$@]/g, "\\$&"))
	.join("")}]`;

/**
 * A leet character sitting *inside* a word. A cost guard rather than a
 * correctness one — it keeps the overwhelming majority of messages, which carry
 * ordinary standalone digits ("add 3 lessons"), from growing a haystack nothing
 * can match.
 */
const LEET_CANDIDATE = new RegExp(`[a-z]${LEET_CLASS}|${LEET_CLASS}[a-z]`, "i");

const leetspeak = (input: string): string[] => {
	if (!LEET_CANDIDATE.test(input)) return [];
	return [
		input.replace(new RegExp(LEET_CLASS, "g"), (char) => LEET[char] as string),
	];
};

const reversed = (raw: string): string[] =>
	raw.length === 0 ? [] : [[...raw].reverse().join("")];

export const DECODERS: readonly Decoder[] = [
	{ id: ID.base64, decode: decodeBase64, consumesRawText: true },
	{ id: ID.rot13, decode: rot13 },
	{ id: ID.leetspeak, decode: leetspeak },
	{ id: ID.reversed, decode: reversed },
];
