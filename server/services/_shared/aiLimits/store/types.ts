/** One counter window: an opaque key and the ceiling that applies to it. */
export type LimitWindow = { key: string; max: number };

/**
 * The storage boundary for the AI rate limiter. It sees opaque keys and never
 * builds them: the "key is derived from the session, never from request input"
 * invariant lives with the policy in checkAiRateLimit.ts, which is the only
 * place that can enforce it.
 */
export type RateLimitStore = {
	/**
	 * Evaluate EVERY window, then increment ALL of them or NONE. Returns whether
	 * the call is allowed. A rejection must leave every counter untouched —
	 * otherwise a caller already over one ceiling also burns their aggregate.
	 */
	checkAndBump(
		windows: readonly LimitWindow[],
		windowMs: number,
	): Promise<boolean>;
	/** Test-only. Current count for a key; 0 when absent or expired. */
	countForTest(key: string): Promise<number>;
	/** Test-only. Drop all state. */
	resetForTest(): Promise<void>;
};
