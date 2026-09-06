import type { DecoderId } from "./decoders";
import { type Haystack, normalizeForMatching } from "./normalize";
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
/**
 * Which decoders surfaced a rule the raw view did not match on its own.
 *
 * Only the rules that already matched are re-tested, so this costs a handful of
 * regex calls on the rare turn that matched anything at all — not a second pass
 * over the catalogue.
 *
 * A decoder is credited only for a rule absent from the raw view. A rot13
 * haystack that happens to re-match something the plaintext already tripped is
 * not what surfaced the attack, and saying it was would make the telemetry read
 * as obfuscation where there was none.
 */
const decodersResponsibleFor = (
	matchedRuleIds: readonly string[],
	haystacks: readonly Haystack[],
): DecoderId[] => {
	if (matchedRuleIds.length === 0) return [];

	const matchedPatterns = INJECTION_PATTERNS.filter((pattern) =>
		matchedRuleIds.includes(pattern.id),
	);
	const rawText =
		haystacks.find((haystack) => haystack.source === "raw")?.text ?? "";
	const inRaw = new Set(
		matchedPatterns
			.filter((pattern) => pattern.regex.test(rawText))
			.map((pattern) => pattern.id),
	);

	const responsible = haystacks
		.filter((haystack) => haystack.source !== "raw")
		.filter((haystack) =>
			matchedPatterns.some(
				(pattern) =>
					!inRaw.has(pattern.id) && pattern.regex.test(haystack.text),
			),
		)
		.map((haystack) => haystack.source as DecoderId);

	return [...new Set(responsible)];
};

export const detectInjection = (text: string): L1Result => {
	const { haystacks } = normalizeForMatching(text);
	const { score, matchedRuleIds } = scoreMatches(
		haystacks.map((haystack) => haystack.text),
		INJECTION_PATTERNS,
	);

	return {
		verdict: verdictFor(score),
		score,
		matchedRuleIds,
		decoders: decodersResponsibleFor(matchedRuleIds, haystacks),
	};
};
