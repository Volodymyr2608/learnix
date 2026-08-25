/**
 * Per-fingerprint event throttle (spec.md AC 24/25, security.md S6).
 *
 * The motivating path is not an attacker but a dependency outage.
 * _shared/aiLimits/store/upstash.store.ts fails closed and logs once PER AI REQUEST,
 * so an Upstash outage emits one event per request across every user — 5,000 gone in
 * minutes, precisely during the incident the tracker exists to make visible.
 * email.service.ts has the same shape under a Resend outage, and safeRequest under a
 * database blip on an anonymous marketing page.
 *
 * Sentry's Dedupe integration does not bound this: it suppresses only CONSECUTIVE
 * identical events, and these arrive interleaved across concurrent requests.
 *
 * Per-process by design. With N Vercel instances the effective cap is
 * N × SENTRY_MAX_PER_FINGERPRINT. That is the same construction ADR-027 rejected for
 * the rate limiter, accepted here for the opposite reason: a Redis round trip per
 * error report is a worse trade than an imprecise cap, and this bounds a budget
 * rather than an authorization decision. Recorded as residual S6.
 */
export const SENTRY_MAX_PER_FINGERPRINT = 10;
export const SENTRY_THROTTLE_WINDOW_MS = 60_000;

/** Same bound and same shape as aiLimits/store/memory.store.ts. */
export const EVICT_THRESHOLD = 5_000;

type Entry = { count: number; resetAt: number };
type Clock = () => number;

/**
 * Exported for tests, which inject a fake clock rather than reaching for
 * vi.useFakeTimers() — the same seam createRateLimiter(store) uses.
 */
export const createThrottle = (clock: Clock = Date.now) => {
	const counts = new Map<string, Entry>();

	const evict = (now: number): void => {
		if (counts.size <= EVICT_THRESHOLD) return;

		const before = counts.size;
		for (const [key, entry] of counts) {
			if (now >= entry.resetAt) counts.delete(key);
		}
		if (counts.size < before) return;

		// Nothing expired — a burst of live fingerprints. Drop the oldest 10% by
		// insertion order. Failing open here means a few extra events, never a
		// suppressed one, which is the right direction for a telemetry budget.
		const surplus = Math.ceil(counts.size * 0.1);
		let dropped = 0;
		for (const key of counts.keys()) {
			counts.delete(key);
			if (++dropped >= surplus) break;
		}
	};

	const shouldThrottle = (fingerprint: string): boolean => {
		const now = clock();
		evict(now);

		const entry = counts.get(fingerprint);
		if (!entry || now >= entry.resetAt) {
			counts.set(fingerprint, {
				count: 1,
				resetAt: now + SENTRY_THROTTLE_WINDOW_MS,
			});
			return false;
		}

		entry.count += 1;
		return entry.count > SENTRY_MAX_PER_FINGERPRINT;
	};

	// No reset helper is exported. Tests construct their own instance via
	// createThrottle(clock), so one is unnecessary — and the name `resetForTest` is
	// banned in production code by aiLimits.contract.test.ts, because on the Upstash
	// adapter that helper is KEYS + DEL across the whole key space.
	return {
		shouldThrottle,
		sizeForTest: (): number => counts.size,
	};
};

/**
 * Pinned on globalThis for the reason memory.store.ts documents: Next bundles route
 * handlers, the tRPC handler and the RSC server separately, so module-scope state is
 * per bundle instance and one budget would silently become three.
 */
const globalForThrottle = globalThis as unknown as {
	sentryThrottle?: ReturnType<typeof createThrottle>;
};
export const throttle = globalForThrottle.sentryThrottle ?? createThrottle();
globalForThrottle.sentryThrottle = throttle;
