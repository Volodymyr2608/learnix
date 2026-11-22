import type { PayoutRun } from "@/generated/prisma";
import { env } from "@/lib/env";
import { notificationLogRepository } from "@/server/repositories/notificationLog.repository";
import { payoutRepository } from "@/server/repositories/payout.repository";
import { payoutRunRepository } from "@/server/repositories/payoutRun.repository";
import { refundRequestRepository } from "@/server/repositories/refundRequest.repository";
import { userRepository } from "@/server/repositories/user.repository";
import { emailService } from "@/server/services/email/email.service";
import type { TemplateKey } from "@/server/services/email/email.templates";
import { logger } from "@/server/utils/logger";

/** FR-A10: alert when no run has succeeded for this long. */
export const STALE_AFTER_MS = 48 * 60 * 60 * 1000;

const panelUrl = () => `${env.BASE_URL}/admin/payouts`;
const utcDay = (now: Date) => now.toISOString().slice(0, 10);

/**
 * M5: one email per de-dup key. The key is logged first, so concurrent callers send once; a failed
 * send deletes it again, so the next check retries instead of staying silent.
 */
const sendOnce = async (input: {
	dedupKey: string;
	userId: string;
	automation: string;
	templateKey: TemplateKey;
	toEmail: string;
	payload: unknown;
}): Promise<boolean> => {
	const logged = await notificationLogRepository.tryLog({
		dedupKey: input.dedupKey,
		userId: input.userId,
		automation: input.automation,
	});
	if (!logged.created) return false;
	try {
		await emailService.send({
			templateKey: input.templateKey,
			toEmail: input.toEmail,
			userId: input.userId,
			payload: input.payload,
		});
		return true;
	} catch (error) {
		await notificationLogRepository.deleteByDedupKey(input.dedupKey);
		logger.error("Payout alert email failed; it will be retried", {
			dedupKey: input.dedupKey,
			error,
		});
		return false;
	}
};

class AdminAlertService {
	/** FR-A10 (M6): every admin, once per failed run. */
	async runFailed(
		run: Pick<PayoutRun, "id" | "error" | "startedAt">,
	): Promise<void> {
		const admins = await userRepository.findAdmins();
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
		const stale = last
			? now.getTime() - last.startedAt.getTime() > STALE_AFTER_MS
			: (await payoutRepository.countHeld()) > 0;
		if (!stale) return false;
		const admins = await userRepository.findAdmins();
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
		const admins = await userRepository.findAdmins();
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
