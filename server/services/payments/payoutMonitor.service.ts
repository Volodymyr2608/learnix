import type {
	PayoutPanel,
	PayoutRunView,
} from "@/server/entities/payout/payout.dto";
import { payoutRepository } from "@/server/repositories/payout.repository";
import { payoutRunRepository } from "@/server/repositories/payoutRun.repository";
import { refundRequestRepository } from "@/server/repositories/refundRequest.repository";
import { STALE_AFTER_MS } from "./adminAlert.service";
import { PAYOUT_LOCK_TTL_MS } from "./payoutJob.constants";
import { isDueSoon, runOutcome } from "./payoutMonitorRules";
import { REFUND_OVERDUE_MS } from "./payoutWatchdog.service";

const HISTORY_SIZE = 20;

const toView = (
	run: {
		id: string;
		trigger: PayoutRunView["trigger"];
		startedAt: Date;
		finishedAt: Date | null;
		error: string | null;
		processed: number;
		released: number;
		failures: unknown;
	},
	now: Date,
): PayoutRunView => ({
	id: run.id,
	trigger: run.trigger,
	startedAt: run.startedAt,
	finishedAt: run.finishedAt,
	outcome: runOutcome(run, now),
	processed: run.processed,
	released: run.released,
	failed: Array.isArray(run.failures) ? run.failures.length : 0,
	error: run.error,
});

class PayoutMonitorService {
	/** FR-A8 / AC-F11: everything the admin Payouts panel shows, read in one call. */
	async getStatus(now: Date): Promise<PayoutPanel> {
		const [
			latest,
			lastSuccess,
			history,
			held,
			overdueRefunds,
			stuck,
			reversals,
		] = await Promise.all([
			payoutRunRepository.findLatest(),
			payoutRunRepository.findLastSuccessful(),
			payoutRunRepository.findHistory(HISTORY_SIZE),
			payoutRepository.findHeld(),
			refundRequestRepository.findOverdueForPanel(
				new Date(now.getTime() - REFUND_OVERDUE_MS),
			),
			payoutRepository.findStuckTransferring(
				new Date(now.getTime() - PAYOUT_LOCK_TTL_MS),
			),
			payoutRepository.findRefundedTransferred(50),
		]);

		// M2 / M3: the same rule as the 48 h alert.
		const stale = lastSuccess
			? now.getTime() - lastSuccess.startedAt.getTime() > STALE_AFTER_MS
			: held.length > 0;
		const lastFailures = Array.isArray(latest?.failures)
			? (latest.failures as { paymentId: string; error: string }[])
			: [];

		return {
			lastRun: latest ? toView(latest, now) : null,
			lastRunFailures: lastFailures,
			lastSuccessAt: lastSuccess?.startedAt ?? null,
			stale,
			history: history.map((run) => toView(run, now)),
			heldFunds: {
				count: held.length,
				totalCents: held.reduce(
					(sum, p) => sum + (p.instructorNetCents ?? 0),
					0,
				),
				dueSoonCents: held
					.filter((p) => isDueSoon(p, now))
					.reduce((sum, p) => sum + (p.instructorNetCents ?? 0), 0),
			},
			problems: {
				overdueRefunds,
				stuckTransfers: stuck.map((p) => ({
					paymentId: p.id,
					amountCents: p.instructorNetCents ?? 0,
					since: p.updatedAt,
				})),
				pendingReversals: reversals.map((p) => ({
					paymentId: p.id,
					amountCents: p.instructorNetCents ?? 0,
					refundedAt: p.refundedAt,
				})),
			},
		};
	}
}

export const payoutMonitorService = new PayoutMonitorService();
