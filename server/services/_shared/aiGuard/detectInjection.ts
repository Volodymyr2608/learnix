import { normalizeForMatching } from "./normalize";
import { BLOCK_THRESHOLD, INJECTION_PATTERNS } from "./patterns";
import type { L1Result, L1Verdict } from "./types";

const verdictFor = (score: number): L1Verdict => {
	if (score === 0) return "allow";
	if (score >= BLOCK_THRESHOLD) return "block";
	return "suspect";
};

/**
 * Layer 1 of the guard: deterministic, synchronous, no network.
 *
 * Scores the union of matches across the normalized text and any decoded base64
 * segments. Weights SUM (they are not maxed) so that combining categories — the
 * shape of a real attack — crosses the threshold, while prose that merely
 * describes an attack trips at most one rule and lands in "suspect".
 *
 * "suspect" never blocks on its own; the orchestrator escalates it to L2.
 */
export const detectInjection = (text: string): L1Result => {
	const { normalized, decodedSegments } = normalizeForMatching(text);
	const haystacks = [normalized, ...decodedSegments];

	const matched = INJECTION_PATTERNS.filter((pattern) =>
		haystacks.some((hay) => pattern.regex.test(hay)),
	);

	const score = matched.reduce((sum, pattern) => sum + pattern.weight, 0);

	return {
		verdict: verdictFor(score),
		score,
		matchedRuleIds: matched.map((pattern) => pattern.id),
	};
};
