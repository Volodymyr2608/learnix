import type { PayoutRun } from "@/generated/prisma";
import { env } from "@/lib/env";
import { payoutRepository } from "@/server/repositories/payout.repository";
import { payoutRunRepository } from "@/server/repositories/payoutRun.repository";
import { refundRequestRepository } from "@/server/repositories/refundRequest.repository";
import {
	ANONYMISED_EMAIL_DOMAIN,
	userRepository,
} from "@/server/repositories/user.repository";
import { sendOnce } from "@/server/services/email/sendOnce";
import { logger } from "@/server/utils/logger";
import { isStale } from "./payoutMonitorRules";

const panelUrl = () => `${env.BASE_URL}/admin/payouts`;
const utcDay = (now: Date) => now.toISOString().slice(0, 10);

/** Review M4: with no ADMIN user an alert has nobody to reach — say so in the logs. */
const adminsOrWarn = async (automation: string) => {
	const admins = await userRepository.findAdmins();
	if (admins.length === 0) {
		logger.warn("No admin user to receive a payout alert", { automation });
	}
	return admins;
};

class AdminAlertService {
	/** FR-A10 (M6): every admin, once per failed run. */
	async runFailed(
		run: Pick<PayoutRun, "id" | "error" | "startedAt">,
	): Promise<void> {
		const admins = await adminsOrWarn("payout_run_failed");
		for (const admin of admins) {
			await sendOnce({
				dedupKey: `admin:${admin.id}:payout_run_failed:${run.id}`,
				userId: admin.id,
				automation: "payout_run_failed",
				templateKey: "admin.payout-run-failed",
				toEmail: admin.email,
				payload: {
					runId: run.id,
					error: run.error ?? "unknown error",
					startedAt: run.startedAt.toISOString(),
					panelUrl: panelUrl(),
				},
			});
		}
	}

	/**
	 * FR-A10 / M2 / M3: no successful run for 48 h (or none ever, while money is held) → every
	 * admin, once per UTC day while it lasts. Returns whether payouts are stale.
	 */
	async checkStale(now: Date): Promise<boolean> {
		const last = await payoutRunRepository.findLastSuccessful();
		const held = last ? 0 : await payoutRepository.countHeld();
		if (!isStale(last?.startedAt ?? null, held, now)) return false;
		const admins = await adminsOrWarn("payout_stale");
		for (const admin of admins) {
			await sendOnce({
				dedupKey: `admin:${admin.id}:payout_stale:${utcDay(now)}`,
				userId: admin.id,
				automation: "payout_stale",
				templateKey: "admin.payout-stale",
				toEmail: admin.email,
				payload: {
					lastSuccessAt: last?.startedAt.toISOString() ?? null,
					panelUrl: panelUrl(),
				},
			});
		}
		return true;
	}

	/**
	 * FR-A11 (M6, M7): a refund still processing 3 days after approval — every admin and the
	 * student, once each per request. The student's email carries fixed text only (C23).
	 */
	async refundOverdue(requestId: string): Promise<void> {
		const request = await refundRequestRepository.findForReminder(requestId);
		if (!request || request.refundState !== "processing") return;
		const admins = await adminsOrWarn("refund_overdue");
		for (const admin of admins) {
			await sendOnce({
				dedupKey: `admin:${admin.id}:refund_overdue:${request.id}`,
				userId: admin.id,
				automation: "refund_overdue",
				templateKey: "admin.refund-overdue",
				toEmail: admin.email,
				payload: {
					requestId: request.id,
					approvedAt: request.createdAt.toISOString(),
					panelUrl: panelUrl(),
				},
			});
		}
		// Audit L3: an anonymised student has no mailbox to tell.
		if (request.student.email.endsWith(ANONYMISED_EMAIL_DOMAIN)) return;
		await sendOnce({
			dedupKey: `${request.student.id}:refund_still_processing:${request.id}`,
			userId: request.student.id,
			automation: "refund_still_processing",
			templateKey: "refund.still-processing",
			toEmail: request.student.email,
			payload: {
				name: request.student.name,
				courseTitle: request.course.title,
			},
		});
	}
}

export const adminAlertService = new AdminAlertService();
