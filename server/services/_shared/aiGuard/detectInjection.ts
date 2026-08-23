import { normalizeForMatching } from "./normalize";
import { BLOCK_THRESHOLD, INJECTION_PATTERNS, scoreMatches } from "./patterns";
import type { L1Result, L1Verdict } from "./types";

const verdictFor = (score: number): L1Verdict => {
	if (score === 0) return "allow";
	if (score >= BLOCK_THRESHOLD) return "block";
	return "suspect";
};

/**
 * Layer 1 of the guard: deterministic, synchronous, no network.
 *
 * Scores the union of every language's pattern set plus the universal rules,
 * across the normalized text and any decoded base64 segments. Coverage is a
 * property of this layer, not of any row in the database — nothing a course
 * declares can narrow it.
 *
 * Scoring groups by rule identity (see patterns/scoring.ts), so a near-cognate
 * matching in two languages counts once while two distinct rules still sum.
 *
 * "suspect" never blocks on its own; the orchestrator escalates it to L2.
 */
export const detectInjection = (text: string): L1Result => {
	const { normalized, decodedSegments } = normalizeForMatching(text);
	const haystacks = [normalized, ...decodedSegments];
	const { score, matchedRuleIds } = scoreMatches(haystacks, INJECTION_PATTERNS);

	return { verdict: verdictFor(score), score, matchedRuleIds };
};
