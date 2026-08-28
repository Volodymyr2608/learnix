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
 * `quizSubmit` is not a member of `AiFeature`, so this key space cannot collide
 * with the AI limiter's `${userId}:${feature}` — and `quizId` is placed where a
 * scope goes, after a segment no feature name can occupy.
 *
 * The userId comes from the session; only the quizId comes from input, and it
 * can only ever narrow a caller's own window, never reach another caller's.
 */
const submitKey = (userId: string, quizId: string) =>
	`${userId}:quizSubmit:${quizId}`;

export const createQuizSubmitLimiter = (store: RateLimitStore) => {
	const check = (userId: string, quizId: string): Promise<boolean> =>
		store.checkAndBump(
			[{ key: submitKey(userId, quizId), max: MAX_SUBMITS_PER_WINDOW }],
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
