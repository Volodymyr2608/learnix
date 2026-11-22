import { PAYOUT_LOCK_TTL_MS } from "./payoutJob.constants";
import { releaseEligibleAt } from "./payoutRules";

export type RunOutcome = "succeeded" | "failed" | "running" | "crashed";

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

export const isDueSoon = (
	payment: { paidAt: Date | null; createdAt: Date },
	now: Date,
): boolean =>
	releaseEligibleAt(payment.paidAt, payment.createdAt).getTime() <=
	now.getTime() + DUE_SOON_MS;
