import { PayoutRetryError } from "./payment.errors";
import { PAYOUT_LOCK_TTL_MS } from "./payoutJob.constants";
import { getRunLock } from "./runLock";

/** ADR-037 §3.2: the one lock the payout run, its Retries and the exception refund share. */
export const PAYOUT_LOCK_NAME = "payouts";

/**
 * Audit L1 / V14: work that changes money on a payment never races the payout run; while the run
 * holds the lock it fails with CONFLICT instead of waiting.
 */
export const withPayoutRunLock = async <T>(
	work: () => Promise<T>,
): Promise<T> => {
	const lock = getRunLock();
	const token = await lock.acquire(PAYOUT_LOCK_NAME, PAYOUT_LOCK_TTL_MS);
	if (!token) {
		throw new PayoutRetryError(
			"The payout job is running; retry when it has finished",
			"CONFLICT",
		);
	}
	try {
		return await work();
	} finally {
		await lock.release(PAYOUT_LOCK_NAME, token);
	}
};
