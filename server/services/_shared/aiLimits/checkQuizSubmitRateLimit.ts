import { rateLimitStore } from "./store";
import type { RateLimitStore } from "./store/types";

/**
 * A NON-AI window on the same store. It shares the storage and nothing else:
 * quiz submission is not a model call, and spending a student's tutor allowance
 * on it would be the defect `ai-tutor-guardrails` S13 §17/§31 already records —
 * a cheap, unrelated request eating the budget for the expensive one.
 *
 * The security work here is done by the attempt cap, which is a predicate in the
 * statement that writes the attempt. This bounds request volume: the cap makes a
 * fourth graded attempt impossible, but nothing stopped a client from asking a
 * thousand times a minute and being told so.
 */
const WINDOW_MS = 60_000;

/** Well above any human answering rate, and far below a script's. */
export const MAX_SUBMITS_PER_WINDOW = 10;

/**
 * The ceiling that actually bounds a client, because the per-quiz one does not:
 * `quizId` comes from the request, so a caller sweeping made-up ids gets a fresh
 * per-quiz budget every time and the limiter never fires. Generous enough that a
 * student working through a lesson never meets it.
 */
export const MAX_SUBMITS_PER_USER_WINDOW = 30;

/**
 * `quizSubmit` is not a member of `AiFeature`, so this key space cannot collide
 * with the AI limiter's `${userId}:${feature}` — and `quizId` is placed where a
 * scope goes, after a segment no feature name can occupy.
 *
 * The userId comes from the session; only the quizId comes from input, and it
 * can only ever narrow a caller's own window, never reach another caller's.
 */
const submitKey = (userId: string, quizId: string) =>
	`${userId}:quizSubmit:${quizId}`;

/**
 * Disjoint from both existing key spaces for the same reason the per-quiz key
 * is: `quizSubmit` is not a member of `AiFeature`, and the aggregate key is
 * separated by a space at index `userId.length`.
 */
const userKey = (userId: string) => `${userId}:quizSubmit`;

const createQuizSubmitLimiter = (store: RateLimitStore) => {
	// Both windows in one call: the store evaluates every window before
	// incrementing any, so a caller already over one ceiling does not also spend
	// the other.
	const check = (userId: string, quizId: string): Promise<boolean> =>
		store.checkAndBump(
			[
				{ key: userKey(userId), max: MAX_SUBMITS_PER_USER_WINDOW },
				{ key: submitKey(userId, quizId), max: MAX_SUBMITS_PER_WINDOW },
			],
			WINDOW_MS,
		);

	return { checkQuizSubmitRateLimit: check };
};

/**
 * No test-only reset of its own: the window lives in the same store as the AI
 * ones, so a test clears it with `__resetWindowsForTest`. Re-exporting the
 * store's reset from here would put `KEYS … DEL` — which drops every user's
 * counters in the environment — one deep import away from production code.
 */
const limiter = createQuizSubmitLimiter(rateLimitStore);

export const checkQuizSubmitRateLimit = limiter.checkQuizSubmitRateLimit;
