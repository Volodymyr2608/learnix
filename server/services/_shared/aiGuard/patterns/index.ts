import { EN_PATTERNS, EN_RULE_IDS } from "./en";
import type { InjectionPattern } from "./types";
import { UNIVERSAL_PATTERNS, UNIVERSAL_RULE_IDS } from "./universal";

export type { InjectionPattern, PatternCategory, PatternLang, PatternScope } from "./types";
export { ruleIdentity } from "./identity";
export { scoreMatches } from "./scoring";

/** Score at or above this blocks. Below it (and above 0) escalates to L2. */
export const BLOCK_THRESHOLD = 40;

/**
 * The closed rule-id vocabulary. Derived from the per-file id objects, never
 * retyped, so a literal that is not a real rule cannot type-check as a RuleId
 * and the vocabulary cannot drift from the patterns (security.md S5).
 */
export const RULE_ID_VOCABULARY = [
	...EN_RULE_IDS,
	...UNIVERSAL_RULE_IDS,
] as const;

export type RuleId = (typeof RULE_ID_VOCABULARY)[number];

export const INJECTION_PATTERNS: readonly InjectionPattern[] = [
	...EN_PATTERNS,
	...UNIVERSAL_PATTERNS,
];