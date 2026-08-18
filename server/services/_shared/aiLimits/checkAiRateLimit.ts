import type { AiFeature } from "@/server/services/_shared/aiGuard/types";

/**
 * Derived, never hand-maintained. The union this replaces omitted quizAI and
 * lessonInsightsAI, so those two surfaces could not be rate-limited by type at
 * all — G2's defect class one layer down. Pinned by a source-text assertion,
 * because TypeScript cannot distinguish this alias from a hand-copied union.
 */
export type AiRateLimitFeature = AiFeature;

const WINDOW_MS = 60_000;

const PER_FEATURE_MAX: Record<AiFeature, number> = {
	lessonAI: 20,
	courseAI: 20,
	quizAI: 10,
	lessonInsightsAI: 10,
	// NOT 1: this is the UNSCOPED ceiling, and 1 here would collapse the
	// per-course rule into 1/min across all of a student's courses. The 1/min
	// per-(student, course) contract lives in SCOPED_MAX below, keyed on a
	// VERIFIED enrollment courseId — a limiter key must never be derived from
	// request input, which is why the scope cannot come through the middleware.
	learningPathAI: 10,
};

/**
 * The ceiling for a SCOPED window, which is a different rule from the
 * per-feature one above. learningPathAI's contract is 1 regeneration per minute
 * per (student, course) — the rule the old private bucket enforced. Without
 * this, a scoped call inherits PER_FEATURE_MAX and the rule silently becomes
 * 10/min per course: a 10x amplification on the most expensive surface here.
 *
 * A feature absent from this table has no scoped rule and keeps its per-feature
 * ceiling, which is why it is Partial and why the lookup below is explicit
 * about the fallback.
 */
const SCOPED_MAX: Partial<Record<AiFeature, number>> = {
	learningPathAI: 1,
};

/** Below the sum of the per-feature ceilings on purpose: the aggregate is the budget. */
export const AGGREGATE_MAX = 30;
export const EVICT_THRESHOLD = 5_000;

type Entry = { count: number; resetAt: number };

/**
 * Pinned on globalThis, not module scope. Next bundles route handlers, the tRPC
 * handler and the RSC server separately; module-scope state is per bundle
 * instance, so "one aggregate bucket" would silently become two or three inside
 * a single process — and every unit test would still pass, because they import
 * the module once. Same pattern as server/db.ts.
 */
const globalForLimits = globalThis as unknown as {
	aiRateWindows?: Map<string, Entry>;
};
const windows = globalForLimits.aiRateWindows ?? new Map<string, Entry>();
globalForLimits.aiRateWindows = windows;

/**
 * Key spaces are disjoint because the character at index userId.length is ":"
 * for every feature key and " " for the aggregate, and userId is server-derived.
 * NOT because "no key contains a space" — `scope` can contain anything.
 */
const aggregateKey = (userId: string) => `${userId} aggregate`;
const featureKey = (userId: string, feature: string, scope?: string) =>
	scope ? `${userId}:${feature}:${scope}` : `${userId}:${feature}`;

const evict = (now: number): void => {
	if (windows.size <= EVICT_THRESHOLD) return;

	const before = windows.size;
	for (const [key, entry] of windows) {
		if (now >= entry.resetAt) windows.delete(key);
	}
	if (windows.size < before) return;

	// Nothing expired — a burst of live keys. Dropping the oldest 10% by INSERTION
	// order resets ~500 windows at once, i.e. a fresh budget for ~500 users, and it
	// fires exactly under the load where the ceiling matters. Fails OPEN, never
	// closed. Reaching it needs ~170+ concurrently active users at full rate; a
	// single account cannot steer it, because bump() is never reached on a
	// rejected call. Magnitude recorded in security.md S16.
	const surplus = Math.ceil(windows.size * 0.1);
	let dropped = 0;
	for (const key of windows.keys()) {
		windows.delete(key);
		if (++dropped >= surplus) break;
	}
};

const peek = (key: string, now: number): Entry | undefined => {
	const entry = windows.get(key);
	return !entry || now >= entry.resetAt ? undefined : entry;
};

const bump = (key: string, now: number): void => {
	const entry = peek(key, now);
	if (!entry) windows.set(key, { count: 1, resetAt: now + WINDOW_MS });
	else entry.count++;
};

/**
 * One aggregate bucket per user, shared by the raw app/api/chat routes and every
 * tRPC AI procedure. Living here rather than in the tRPC middleware is the
 * point: a middleware-side aggregate would leave the three SSE routes on a
 * separate budget.
 *
 * Both windows are evaluated before either is incremented — no await between
 * peek and bump, so this is atomic within Node's single-threaded execution.
 *
 * `countAggregate: false` is for the SECOND limiter call inside one request
 * (learningPathAI checks an aggregate at the procedure and a scoped window in
 * the service). Without it one user request would spend two of AGGREGATE_MAX.
 */
export const checkAiRateLimit = (
	userId: string,
	feature: AiRateLimitFeature,
	opts?: { scope?: string; countAggregate?: boolean },
): boolean => {
	const now = Date.now();
	evict(now);

	const countAggregate = opts?.countAggregate !== false;
	const aggKey = aggregateKey(userId);
	const featKey = featureKey(userId, feature, opts?.scope);
	// PER_FEATURE_MAX is total over AiFeature, so a sixth surface fails to
	// compile rather than silently inheriting a ceiling. SCOPED_MAX is partial by
	// design: only a feature with a per-scope contract appears there.
	const max = opts?.scope
		? (SCOPED_MAX[feature] ?? PER_FEATURE_MAX[feature])
		: PER_FEATURE_MAX[feature];

	const agg = countAggregate ? peek(aggKey, now) : undefined;
	const feat = peek(featKey, now);

	if (countAggregate && (agg?.count ?? 0) >= AGGREGATE_MAX) return false;
	if ((feat?.count ?? 0) >= max) return false;

	if (countAggregate) bump(aggKey, now);
	bump(featKey, now);
	return true;
};

export const MAX_MSG_LENGTH = 2000;
export const validateMessageLength = (m: string): boolean =>
	m.length <= MAX_MSG_LENGTH;

export const __resetWindowsForTest = (): void => windows.clear();
export const __windowSizeForTest = (): number => windows.size;
export const __aggregateCountForTest = (userId: string): number =>
	windows.get(aggregateKey(userId))?.count ?? 0;
export const __featureCountForTest = (
	userId: string,
	feature: string,
	scope?: string,
): number => windows.get(featureKey(userId, feature, scope))?.count ?? 0;
