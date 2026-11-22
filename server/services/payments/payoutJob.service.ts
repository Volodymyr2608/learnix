import type Stripe from "stripe";
import type { Payment, PayoutRunTrigger } from "@/generated/prisma";
import type {
	PayoutRunCounts,
	PayoutRunSummary,
	RefundRunCounts,
	ReleaseOutcome,
} from "@/server/entities/payout/payout.dto";
import { payoutRepository } from "@/server/repositories/payout.repository";
import { payoutRunRepository } from "@/server/repositories/payoutRun.repository";
import { refundRequestRepository } from "@/server/repositories/refundRequest.repository";
import { stripeReplayCursorRepository } from "@/server/repositories/stripeReplayCursor.repository";
import { refundService } from "@/server/services/refund/refund.service";
import { logger } from "@/server/utils/logger";
import { connectService } from "./connect.service";
import { getRunLock } from "./runLock";
import { stripe } from "./stripe.client";
import { stripeEventService } from "./stripeEvent.service";

/** FR-P3: ~1.5 s per payment keeps a run near 75 s of the 300 s Hobby limit (decision BATCH). */
export const PAYOUT_BATCH_SIZE = 50;
/** H7: longer than one Hobby run, so a crashed run cannot block the next day. */
export const PAYOUT_LOCK_TTL_MS = 15 * 60 * 1000;
const LOCK_NAME = "payouts";
/** R7: processing refunds retried per run. */
export const REFUND_RETRY_BATCH = 20;
/** D8: the events the daily job replays, under one cursor. */
const REPLAY_CURSOR = "stripe_events";
const REPLAYED_EVENTS = [
	"charge.refunded",
	"charge.dispute.created",
	"charge.dispute.updated",
	"charge.dispute.closed",
] as const;
/** R6: Stripe keeps events for 30 days; the first replay starts there. */
const REPLAY_START_SECONDS = 30 * 24 * 60 * 60;

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

/** FR-S20 (R7): retries approved requests whose Stripe refund has not succeeded yet. */
const retryRefunds = async (now: Date): Promise<number> => {
	const ids =
		await refundRequestRepository.findProcessingIds(REFUND_RETRY_BATCH);
	let refunded = 0;
	for (const id of ids) {
		// qa #3: one request that keeps failing must not stop the run.
		try {
			if ((await refundService.executeRefund(id, now)) === "refunded")
				refunded++;
		} catch (error) {
			logger.error("Refund retry failed", { requestId: id, error });
		}
	}
	return refunded;
};

/** FR-P7: a reversal that failed after a refund's effects is retried here. */
const retryReversals = async (): Promise<void> => {
	const payments =
		await payoutRepository.findRefundedTransferred(REFUND_RETRY_BATCH);
	for (const payment of payments) {
		try {
			await connectService.reverseTransfer(payment);
		} catch (error) {
			logger.error("Reversal retry failed", { paymentId: payment.id, error });
		}
	}
};

/**
 * FR-P15 / S7 / FR-P18a: replays refund and dispute events since the cursor through the webhook's handler,
 * oldest first. `gte` re-reads the last second, so events sharing it are never skipped; a
 * duplicate is harmless (C8). The cursor stops at the last event handled before an error.
 */
const replayRefundEvents = async (now: Date): Promise<number> => {
	const since =
		(await stripeReplayCursorRepository.get(REPLAY_CURSOR)) ??
		Math.floor(now.getTime() / 1000) - REPLAY_START_SECONDS;
	const events: Stripe.Event[] = [];
	let startingAfter: string | undefined;
	for (;;) {
		const page = await stripe.events.list({
			types: [...REPLAYED_EVENTS],
			created: { gte: since },
			limit: 100,
			...(startingAfter ? { starting_after: startingAfter } : {}),
		});
		events.push(...page.data);
		const last = page.data.at(-1);
		if (!page.has_more || !last) break;
		startingAfter = last.id;
	}
	events.sort((a, b) => a.created - b.created);

	let cursor = since;
	let replayed = 0;
	for (const event of events) {
		try {
			await stripeEventService.handle(event, now);
		} catch (error) {
			logger.error("Event replay stopped", { eventId: event.id, error });
			break;
		}
		cursor = Math.max(cursor, event.created);
		replayed++;
	}
	await stripeReplayCursorRepository.save(REPLAY_CURSOR, cursor);
	return replayed;
};

/** Releases each payment independently, then records the run (FR-P5). */
const releaseAndRecord = async (
	payments: Payment[],
	trigger: PayoutRunTrigger,
	now: Date,
	refundCounts: RefundRunCounts = { refundsRetried: 0, eventsReplayed: 0 },
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
		...refundCounts,
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
			// R7: refunds first, so the release below never pays out a sale refunded meanwhile.
			const refundCounts: RefundRunCounts = {
				refundsRetried: await retryRefunds(input.now),
				eventsReplayed: await replayRefundEvents(input.now).catch((error) => {
					// A Stripe outage must not stop the releases below.
					logger.error("Event replay failed", { error });
					return 0;
				}),
			};
			await retryReversals();
			const candidates = await payoutRepository.findReleaseCandidates(
				input.now,
				PAYOUT_BATCH_SIZE,
			);
			const counts = await releaseAndRecord(
				candidates,
				input.trigger,
				input.now,
				refundCounts,
			);
			return { status: "completed", ...counts, ...refundCounts };
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
