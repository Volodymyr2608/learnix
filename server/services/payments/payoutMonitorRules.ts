import { PAYOUT_LOCK_TTL_MS } from "./payoutJob.constants";
import { releaseEligibleAt } from "./payoutRules";

export type RunOutcome = "succeeded" | "failed" | "running" | "crashed";

/** FR-A10: alert when no run has succeeded for this long. */
export const STALE_AFTER_MS = 48 * 60 * 60 * 1000;

/** FR-A11 (M7): the day-3 reminder clock starts at the automatic approval. */
export const REFUND_OVERDUE_MS = 3 * 24 * 60 * 60 * 1000;

/** M9: "due in the coming days" = releasable within this window. */
export const DUE_SOON_MS = 7 * 24 * 60 * 60 * 1000;

/** M1 / M2: what a run row says about the run. */
export const runOutcome = (
	run: { startedAt: Date; finishedAt: Date | null; error: string | null },
	now: Date,
): RunOutcome => {
	if (run.error) return "failed";
	if (run.finishedAt) return "succeeded";
	// Longer than the lock TTL without finishing: the process died mid-run.
	return now.getTime() - run.startedAt.getTime() > PAYOUT_LOCK_TTL_MS
		? "crashed"
		: "running";
};

/** FR-A10 / M2 / M3 — one rule for the 48 h alert and the panel warning (review M1). */
export const isStale = (
	lastSuccessStartedAt: Date | null,
	heldCount: number,
	now: Date,
): boolean =>
	lastSuccessStartedAt
		? now.getTime() - lastSuccessStartedAt.getTime() > STALE_AFTER_MS
		: heldCount > 0;

export const isDueSoon = (
	payment: { paidAt: Date | null; createdAt: Date },
	now: Date,
): boolean =>
	releaseEligibleAt(payment.paidAt, payment.createdAt).getTime() <=
	now.getTime() + DUE_SOON_MS;
