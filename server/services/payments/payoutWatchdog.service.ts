import { refundRequestRepository } from "@/server/repositories/refundRequest.repository";
import { adminAlertService } from "./adminAlert.service";

/** FR-A11 (M7): the day-3 reminder clock starts at the automatic approval. */
export const REFUND_OVERDUE_MS = 3 * 24 * 60 * 60 * 1000;

class PayoutWatchdogService {
	/**
	 * M3: runs on its own daily cron, so a dead or failing release run is still noticed. Every
	 * email it sends is de-duplicated (M6), so running it again sends nothing new.
	 */
	async check(now: Date): Promise<{ stale: boolean; overdueRefunds: number }> {
		const stale = await adminAlertService.checkStale(now);
		const overdue = await refundRequestRepository.findOverdueIds(
			new Date(now.getTime() - REFUND_OVERDUE_MS),
		);
		for (const requestId of overdue) {
			await adminAlertService.refundOverdue(requestId);
		}
		return { stale, overdueRefunds: overdue.length };
	}
}

export const payoutWatchdogService = new PayoutWatchdogService();
