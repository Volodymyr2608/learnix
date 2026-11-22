import { refundRequestRepository } from "@/server/repositories/refundRequest.repository";
import { adminAlertService } from "./adminAlert.service";
import { REFUND_OVERDUE_MS } from "./payoutMonitorRules";

/** Audit L4: a bounded batch per run; the rest follows the next day (the emails are de-duplicated). */
const OVERDUE_BATCH = 50;

class PayoutWatchdogService {
	/**
	 * M3: runs on its own daily cron, so a dead or failing release run is still noticed. Every
	 * email it sends is de-duplicated (M6), so running it again sends nothing new.
	 */
	async check(now: Date): Promise<{ stale: boolean; overdueRefunds: number }> {
		const stale = await adminAlertService.checkStale(now);
		const overdue = await refundRequestRepository.findOverdueIds(
			new Date(now.getTime() - REFUND_OVERDUE_MS),
			OVERDUE_BATCH,
		);
		for (const requestId of overdue) {
			await adminAlertService.refundOverdue(requestId);
		}
		return { stale, overdueRefunds: overdue.length };
	}
}

export const payoutWatchdogService = new PayoutWatchdogService();
