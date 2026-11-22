import { refundRequestRepository } from "@/server/repositories/refundRequest.repository";
import { refundNotificationsService } from "@/server/services/refund/refundNotifications.service";
import { adminAlertService } from "./adminAlert.service";
import { REFUND_OVERDUE_MS } from "./payoutMonitorRules";

/** Audit L4: a bounded batch per run; the rest follows the next day (the emails are de-duplicated). */
const OVERDUE_BATCH = 50;

class PayoutWatchdogService {
	/**
	 * M3: runs on its own daily cron, so a dead or failing release run is still noticed. Every
	 * email it sends is de-duplicated (M6), so running it again sends nothing new.
	 */
	async check(now: Date): Promise<{
		stale: boolean;
		overdueRefunds: number;
		resentEmails: number;
		appealReminders: number;
	}> {
		const stale = await adminAlertService.checkStale(now);
		const overdue = await refundRequestRepository.findOverdueIds(
			new Date(now.getTime() - REFUND_OVERDUE_MS),
			OVERDUE_BATCH,
		);
		for (const requestId of overdue) {
			await adminAlertService.refundOverdue(requestId);
		}
		// Review I2: a student refund email whose send failed is retried here, once a day.
		const resentEmails = await refundNotificationsService.resendMissing(now);
		// V12 / FR-A4: undecided appeals remind the admins on days 10 and 13, then daily.
		const appealReminders = await adminAlertService.appealUndecided(now);
		return {
			stale,
			overdueRefunds: overdue.length,
			resentEmails,
			appealReminders,
		};
	}
}

export const payoutWatchdogService = new PayoutWatchdogService();
