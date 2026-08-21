import { describe, expect, it } from "vitest";
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
];

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
