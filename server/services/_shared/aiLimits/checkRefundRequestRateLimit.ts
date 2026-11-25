import { rateLimitStore } from "./store";
import type { RateLimitStore } from "./store/types";

/**
 * U9 — a NON-AI window on the shared store, like `checkQuizSubmitRateLimit`. The refund request
 * waits on a per-student advisory lock inside a transaction (C4); without a limit, one student
 * keeping requests in flight holds pool connections other users need (`security.md`, "Accepted for
 * slice 1 only"). A person files one request per purchase; this is far above that and far below a
 * script.
 */
const WINDOW_MS = 60_000;

export const MAX_REFUND_REQUESTS_PER_WINDOW = 5;

/** `refundRequest` is not an `AiFeature`, so the key cannot collide with the AI limiter's. */
const userKey = (userId: string) => `${userId}:refundRequest`;

const createRefundRequestLimiter = (store: RateLimitStore) => ({
	checkRefundRequestRateLimit: (userId: string): Promise<boolean> =>
		store.checkAndBump(
			[{ key: userKey(userId), max: MAX_REFUND_REQUESTS_PER_WINDOW }],
			WINDOW_MS,
		),
});

export const { checkRefundRequestRateLimit } =
	createRefundRequestLimiter(rateLimitStore);
