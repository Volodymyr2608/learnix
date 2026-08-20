import type { AiFeature } from "@/server/services/_shared/aiGuard/types";
import { rateLimitStore } from "./store";
import type { LimitWindow, RateLimitStore } from "./store/types";

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

/**
 * Key spaces are disjoint because the character at index userId.length is ":"
 * for every feature key and " " for the aggregate, and userId is server-derived.
 * NOT because "no key contains a space" — `scope` can contain anything.
 *
 * These stay here, with the policy, and are never passed to the store: the store
 * sees opaque strings and cannot enforce "derived from the session, never from
 * request input".
 */
const aggregateKey = (userId: string) => `${userId} aggregate`;
const featureKey = (userId: string, feature: string, scope?: string) =>
	scope ? `${userId}:${feature}:${scope}` : `${userId}:${feature}`;

/**
 * Bound to a store rather than reading a module-level one, so the behavioural
 * contract suite can run the identical assertions against both adapters. The
 * production instance below is bound once, at module load.
 */
export const createRateLimiter = (store: RateLimitStore) => {
	/**
	 * One aggregate bucket per user, shared by the raw app/api/chat routes and
	 * every tRPC AI procedure. Living here rather than in the tRPC middleware is
	 * the point: a middleware-side aggregate would leave the three SSE routes on a
	 * separate budget.
	 *
	 * Both windows are handed to the store together because it must evaluate both
	 * before incrementing either — a rejected call spends nothing.
	 *
	 * `countAggregate: false` is for the SECOND limiter call inside one request
	 * (learningPathAI checks an aggregate at the procedure and a scoped window in
	 * the service). Without it one user request would spend two of AGGREGATE_MAX.
	 */
	const check = (
		userId: string,
		feature: AiRateLimitFeature,
		opts?: { scope?: string; countAggregate?: boolean },
	): Promise<boolean> => {
		const countAggregate = opts?.countAggregate !== false;
		// PER_FEATURE_MAX is total over AiFeature, so a sixth surface fails to
		// compile rather than silently inheriting a ceiling. SCOPED_MAX is partial by
		// design: only a feature with a per-scope contract appears there.
		const max = opts?.scope
			? (SCOPED_MAX[feature] ?? PER_FEATURE_MAX[feature])
			: PER_FEATURE_MAX[feature];

		// Aggregate first: it is the window that rejects first today, and the store
		// returns on the first window found at its ceiling.
		const windows: LimitWindow[] = [];
		if (countAggregate) {
			windows.push({ key: aggregateKey(userId), max: AGGREGATE_MAX });
		}
		windows.push({ key: featureKey(userId, feature, opts?.scope), max });

		return store.checkAndBump(windows, WINDOW_MS);
	};

	return {
		checkAiRateLimit: check,
		aggregateCountForTest: (userId: string) =>
			store.countForTest(aggregateKey(userId)),
		featureCountForTest: (userId: string, feature: string, scope?: string) =>
			store.countForTest(featureKey(userId, feature, scope)),
		resetForTest: () => store.resetForTest(),
	};
};

const limiter = createRateLimiter(rateLimitStore);

export const checkAiRateLimit = limiter.checkAiRateLimit;

export const MAX_MSG_LENGTH = 2000;
export const validateMessageLength = (m: string): boolean =>
	m.length <= MAX_MSG_LENGTH;

export const __resetWindowsForTest = limiter.resetForTest;
export const __aggregateCountForTest = limiter.aggregateCountForTest;
export const __featureCountForTest = limiter.featureCountForTest;
