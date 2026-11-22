import type { Payment, PayoutRunTrigger } from "@/generated/prisma";
import type {
	PayoutRunCounts,
	PayoutRunSummary,
	ReleaseOutcome,
} from "@/server/entities/payout/payout.dto";
import { payoutRepository } from "@/server/repositories/payout.repository";
import { payoutRunRepository } from "@/server/repositories/payoutRun.repository";
import { connectService } from "./connect.service";
import { getRunLock } from "./runLock";

/** FR-P3: ~1.5 s per payment keeps a run near 75 s of the 300 s Hobby limit (decision BATCH). */
export const PAYOUT_BATCH_SIZE = 50;
/** H7: longer than one Hobby run, so a crashed run cannot block the next day. */
export const PAYOUT_LOCK_TTL_MS = 15 * 60 * 1000;
const LOCK_NAME = "payouts";

const RELEASED = new Set<ReleaseOutcome["kind"]>([
	"released",
	"already_transferred",
]);

const failureOf = (
	outcome: ReleaseOutcome,
): { paymentId: string; error: string } | null => {
	if (outcome.kind === "failed") {
		return { paymentId: outcome.paymentId, error: outcome.error };
	}
	if (outcome.kind === "charge_not_payable") {
		// H4: a refunded or disputed charge is reported, not silently skipped.
		return {
			paymentId: outcome.paymentId,
			error: "Charge is refunded or disputed in Stripe",
		};
	}
	return null;
};

/** Releases each payment independently, then records the run (FR-P5). */
const releaseAndRecord = async (
	payments: Payment[],
	trigger: PayoutRunTrigger,
	now: Date,
): Promise<{ runId: string } & PayoutRunCounts> => {
	const startedAt = new Date();
	const outcomes: ReleaseOutcome[] = [];
	for (const payment of payments) {
		outcomes.push(await connectService.releasePayment(payment, now));
	}
	const failures = outcomes.flatMap((o) => failureOf(o) ?? []);
	const released = outcomes.filter((o) => RELEASED.has(o.kind)).length;
	const run = await payoutRunRepository.record({
		trigger,
		startedAt,
		finishedAt: new Date(),
		processed: payments.length,
		released,
		failures,
		paymentIds: payments.map((p) => p.id),
	});
	return {
		runId: run.id,
		processed: payments.length,
		released,
		failed: failures.length,
	};
};

class PayoutJobService {
	/**
	 * ADR-037 §3 — the daily job and "Run job now": one run at a time (AC-C16), a bounded batch
	 * selected by state, so a missed run is caught up by the next one (FR-P3).
	 */
	async run(input: {
		trigger: PayoutRunTrigger;
		now: Date;
	}): Promise<PayoutRunSummary> {
		const lock = getRunLock();
		const token = await lock.acquire(LOCK_NAME, PAYOUT_LOCK_TTL_MS);
		if (!token) return { status: "already_running" };
		try {
			const candidates = await payoutRepository.findReleaseCandidates(
				input.now,
				PAYOUT_BATCH_SIZE,
			);
			const counts = await releaseAndRecord(
				candidates,
				input.trigger,
				input.now,
			);
			return { status: "completed", ...counts };
		} finally {
			await lock.release(LOCK_NAME, token);
		}
	}

	/**
	 * account.updated: an instructor just enabled payouts. Their held sales go through the same
	 * release function and predicate (FR-P2); a sale still in its window stays held.
	 */
	async releaseForInstructor(
		instructorId: string,
		now: Date,
	): Promise<{ runId: string } & PayoutRunCounts> {
		const pending =
			await payoutRepository.findPendingForInstructor(instructorId);
		return releaseAndRecord(pending, "account_updated", now);
	}
}

export const payoutJobService = new PayoutJobService();
