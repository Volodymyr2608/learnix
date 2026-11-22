import type { PayoutRun } from "@/generated/prisma";
import { env } from "@/lib/env";
import { paymentRepository } from "@/server/repositories/payment.repository";
import { payoutRepository } from "@/server/repositories/payout.repository";
import { payoutRunRepository } from "@/server/repositories/payoutRun.repository";
import { refundAppealRepository } from "@/server/repositories/refundAppeal.repository";
import { refundRequestRepository } from "@/server/repositories/refundRequest.repository";
import {
	ANONYMISED_EMAIL_DOMAIN,
	userRepository,
} from "@/server/repositories/user.repository";
import { sendOnce } from "@/server/services/email/sendOnce";
import { appealReminderDue } from "@/server/services/refund/appealRules";
import { logger } from "@/server/utils/logger";
import { isStale } from "./payoutMonitorRules";

const panelUrl = () => `${env.BASE_URL}/admin/payouts`;
const refundsUrl = () => `${env.BASE_URL}/admin/refunds`;
const DAY_MS = 24 * 60 * 60 * 1000;
const daysLeft = (deadline: Date, now: Date) =>
	Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / DAY_MS));
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
					approvedAt: (request.approvedAt ?? request.createdAt).toISOString(),
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

	/** V16 / matrix "Appeal filed": every admin, once per appeal. Fixed text only (C22). */
	async appealFiled(appealId: string, now: Date = new Date()): Promise<void> {
		const appeal = await refundAppealRepository.findForAdminNotice(appealId);
		if (!appeal) return;
		const admins = await adminsOrWarn("appeal_filed");
		for (const admin of admins) {
			await sendOnce({
				dedupKey: `admin:${admin.id}:appeal_filed:${appeal.id}`,
				userId: admin.id,
				automation: "appeal_filed",
				templateKey: "admin.appeal-filed",
				toEmail: admin.email,
				payload: {
					title: "A refund appeal was filed",
					summary: `A ${appeal.kind === "direct" ? "direct appeal" : "appeal after an automatic denial"} for ${appeal.request.course.title} is waiting for a decision (${daysLeft(appeal.deadlineAt, now)} days until its deadline).`,
					panelUrl: refundsUrl(),
				},
			});
		}
	}

	/**
	 * FR-A4 (V12): an undecided appeal reminds every admin on payment-day 10 and 13, then daily —
	 * once per admin, appeal and UTC day. Called by the daily watchdog.
	 */
	async appealUndecided(now: Date): Promise<number> {
		const open = await refundAppealRepository.findOpenForJobs(200);
		const due = open.filter((a) =>
			appealReminderDue(a.request.payment.paidAt, now),
		);
		if (due.length === 0) return 0;
		const admins = await adminsOrWarn("appeal_undecided");
		for (const appeal of due) {
			for (const admin of admins) {
				await sendOnce({
					dedupKey: `admin:${admin.id}:appeal_undecided:${appeal.id}:${utcDay(now)}`,
					userId: admin.id,
					automation: "appeal_undecided",
					templateKey: "admin.appeal-undecided",
					toEmail: admin.email,
					payload: {
						title: "A refund appeal is waiting for a decision",
						summary: `An appeal for ${appeal.request.course.title} is still undecided (${daysLeft(appeal.deadlineAt, now)} days until its deadline). The instructor's share stays held until it is decided.`,
						panelUrl: refundsUrl(),
					},
				});
			}
		}
		return due.length;
	}

	/**
	 * FR-A7 (V15): a refund made in the Stripe Dashboard — full or partial — flags the payment
	 * "needs review" and emails every admin, once per payment and refunded amount.
	 */
	async dashboardRefund(
		paymentId: string,
		refundedCents: number,
		now: Date = new Date(),
	): Promise<void> {
		await paymentRepository.markNeedsReview(paymentId, now);
		const payment = await paymentRepository.findForNotice(paymentId);
		if (!payment) return;
		const partial = refundedCents < payment.amountCents;
		const admins = await adminsOrWarn("dashboard_refund");
		for (const admin of admins) {
			await sendOnce({
				dedupKey: `admin:${admin.id}:dashboard_refund:${payment.id}:${refundedCents}`,
				userId: admin.id,
				automation: "dashboard_refund",
				templateKey: "admin.dashboard-refund",
				toEmail: admin.email,
				payload: {
					title: partial
						? "A partial refund was made in the Stripe Dashboard"
						: "A refund was made in the Stripe Dashboard",
					summary: `Payment ${payment.id} for ${payment.course.title} was ${partial ? `partly refunded (${(refundedCents / 100).toFixed(2)} of ${(payment.amountCents / 100).toFixed(2)} ${payment.currency.toUpperCase()}); access and the instructor's share are unchanged` : "refunded in full; its effects were applied"}. It is flagged "needs review".`,
					panelUrl: refundsUrl(),
				},
			});
		}
	}

	/** DL / matrix "Dispute closed lost": every admin, once per payment. */
	async disputeLost(paymentId: string): Promise<void> {
		const payment = await paymentRepository.findForNotice(paymentId);
		if (!payment) return;
		const admins = await adminsOrWarn("dispute_lost");
		for (const admin of admins) {
			await sendOnce({
				dedupKey: `admin:${admin.id}:dispute_lost:${payment.id}`,
				userId: admin.id,
				automation: "dispute_lost",
				templateKey: "admin.dispute-lost",
				toEmail: admin.email,
				payload: {
					title: "A bank dispute was lost",
					summary: `The bank dispute on payment ${payment.id} for ${payment.course.title} was lost. The refund effects were applied automatically.`,
					panelUrl: refundsUrl(),
				},
			});
		}
	}
}

export const adminAlertService = new AdminAlertService();
