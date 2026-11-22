import type { RefundCondition } from "@/server/entities/refund/refund.dto";
import { paymentRepository } from "@/server/repositories/payment.repository";
import { refundRequestRepository } from "@/server/repositories/refundRequest.repository";
import { ANONYMISED_EMAIL_DOMAIN } from "@/server/repositories/user.repository";
import { sendOnce } from "@/server/services/email/sendOnce";

/** FR-S14: the condition an automatic denial names — fixed labels, never stored text. */
export const DENIAL_CONDITION_LABEL: Record<RefundCondition, string> = {
	window: "The 14-day refund period has ended.",
	threshold: "You opened more lessons than the refund limit for this course.",
	certificate: "You already received the course certificate.",
	earlier_refund: "This course was already refunded once.",
	account_limit: "Your account reached the limit of 3 refunds in 12 months.",
	dispute: "A dispute about this payment is open with your bank.",
};

export const formatRefundAmount = (amountCents: number, currency: string) =>
	new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: currency.toUpperCase(),
	}).format(amountCents / 100);

const reachable = (email: string) => !email.endsWith(ANONYMISED_EMAIL_DOMAIN);

class RefundNotificationsService {
	/** U10: the refund of a student's request went through — once per payment. */
	async refundDone(paymentId: string): Promise<void> {
		const payment = await paymentRepository.findForRefundEmail(paymentId);
		if (!payment || !reachable(payment.student.email)) return;
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
}

export const refundNotificationsService = new RefundNotificationsService();
