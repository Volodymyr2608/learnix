import type { RefundCondition } from "@/server/entities/refund/refund.dto";
import { DENIAL_CONDITION_LABEL } from "@/server/entities/refund/refundLabels";
import { paymentRepository } from "@/server/repositories/payment.repository";
import { refundAppealRepository } from "@/server/repositories/refundAppeal.repository";
import { refundRequestRepository } from "@/server/repositories/refundRequest.repository";
import { ANONYMISED_EMAIL_DOMAIN } from "@/server/repositories/user.repository";
import { sendOnce } from "@/server/services/email/sendOnce";

export const formatRefundAmount = (amountCents: number, currency: string) =>
	new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: currency.toUpperCase(),
	}).format(amountCents / 100);

/** Review I2: how far back the daily sweep re-sends, and how many per run. */
const RESEND_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const RESEND_BATCH = 50;

const reachable = (email: string) => !email.endsWith(ANONYMISED_EMAIL_DOMAIN);

class RefundNotificationsService {
	/** U10: the refund of a student's request went through — once per payment. */
	async refundDone(paymentId: string): Promise<void> {
		const payment = await paymentRepository.findForRefundEmail(paymentId);
		if (!payment || !reachable(payment.student.email)) return;
		// An appeal or overdue approval was already announced by the appeal-decided email.
		if (payment.refundRequest?.approval !== "automatic") return;
		await sendOnce({
			dedupKey: `${payment.student.id}:refund_done:${payment.id}`,
			userId: payment.student.id,
			automation: "refund_done",
			templateKey: "refund.done",
			toEmail: payment.student.email,
			payload: {
				name: payment.student.name,
				courseTitle: payment.course.title,
				amount: formatRefundAmount(payment.amountCents, payment.currency),
			},
		});
	}

	/**
	 * Review I2: re-sends a refund-done or denial email whose send failed (no log row). Runs from
	 * the daily watchdog; every send is de-duplicated, so a second run sends nothing.
	 */
	async resendMissing(now: Date): Promise<number> {
		const missing = await refundRequestRepository.findUnnotifiedOutcomes(
			new Date(now.getTime() - RESEND_WINDOW_MS),
			RESEND_BATCH,
		);
		const decided = await refundAppealRepository.findUndecidedEmails(
			new Date(now.getTime() - RESEND_WINDOW_MS),
			RESEND_BATCH,
		);
		for (const row of decided) await this.appealDecided(row.id);
		for (const row of missing) {
			if (row.decision === "auto_denied")
				await this.refundDenied(
					row.id,
					row.failed_conditions as RefundCondition[],
				);
			else await this.refundDone(row.payment_id);
		}
		return missing.length + decided.length;
	}

	/** U10: an automatic denial — once per request, naming the first failed condition. */
	async refundDenied(
		requestId: string,
		failedConditions: RefundCondition[],
	): Promise<void> {
		const condition = failedConditions[0];
		if (!condition) return;
		const request = await refundRequestRepository.findForReminder(requestId);
		if (!request || !reachable(request.student.email)) return;
		await sendOnce({
			dedupKey: `${request.student.id}:refund_denied:${request.id}`,
			userId: request.student.id,
			automation: "refund_denied",
			templateKey: "refund.denied",
			toEmail: request.student.email,
			payload: {
				name: request.student.name,
				courseTitle: request.course.title,
				condition: DENIAL_CONDITION_LABEL[condition],
			},
		});
	}

	/** V16 / FR-S18: the appeal's outcome, once per appeal; a denial carries the admin's reason. */
	async appealDecided(appealId: string): Promise<void> {
		const appeal = await refundAppealRepository.findForDecisionEmail(appealId);
		if (!appeal || appeal.status === "open") return;
		const { student, course, payment } = appeal.request;
		if (!reachable(student.email)) return;
		const amount = formatRefundAmount(payment.amountCents, payment.currency);
		const denied = appeal.status === "denied";
		await sendOnce({
			dedupKey: `${student.id}:appeal_decided:${appeal.id}`,
			userId: student.id,
			automation: "appeal_decided",
			templateKey: "refund.appeal-decided",
			toEmail: student.email,
			payload: {
				name: student.name,
				title: denied
					? `Your refund appeal for ${course.title} was not approved`
					: `Your refund appeal for ${course.title} was approved`,
				body: denied
					? `An admin reviewed your appeal and did not approve it. The reason:\n\n${appeal.denialReason ?? ""}\n\nYou can see the decision and any attached files on your Purchases page.`
					: `${appeal.status === "overdue_approved" ? "Your appeal was not decided in time, so it was approved." : "An admin approved your appeal."} We are refunding ${amount}; the money usually reaches your card in about 5–10 business days. Your access to the course and its progress will be closed.`,
			},
		});
	}
}

export const refundNotificationsService = new RefundNotificationsService();
