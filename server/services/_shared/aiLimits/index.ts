/**
 * The shared resource boundary (L7). One aggregate budget per user across every
 * AI surface, plus a per-feature ceiling, plus an optional scoped window for
 * rules like learningPathAI's 1/min per (student, course).
 *
 * The test-only helpers are exported from the module, not the barrel: a caller
 * reaching for `__resetWindowsForTest` in production code should have to write
 * the deep import.
 */
export {
	AGGREGATE_MAX,
	type AiRateLimitFeature,
	checkAiRateLimit,
	EVICT_THRESHOLD,
	MAX_MSG_LENGTH,
	validateMessageLength,
} from "./checkAiRateLimit";
