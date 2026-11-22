import { paymentRepository } from "@/server/repositories/payment.repository";
import { enrollmentService } from "@/server/services/enrollment/enrollment.service";
import { adminAlertService } from "@/server/services/payments/adminAlert.service";
import { logger } from "@/server/utils/logger";
import { refundNotificationsService } from "./refundNotifications.service";

class BankFailureService {
	/**
	 * FR-P27 / FS-3 (W5): a refund that failed at the bank after its effects were applied. Once per
	 * payment: `bank_failure_at` is set, a cancelled share goes back to held (and the release
	 * predicate keeps it there while the failure is open), the enrollment is reactivated — cleared
	 * learning records stay cleared — and the student and the admins are told.
	 */
	async refundFailed(paymentIntentId: string, now: Date): Promise<void> {
		const payment =
			await paymentRepository.findByPaymentIntentId(paymentIntentId);
		if (!payment) return;
		const marked = await paymentRepository.markBankFailure(payment.id, now);
		if (!marked) return;
		await enrollmentService.reactivateAfterFailedRefund(
			payment.studentId,
			payment.courseId,
		);
		await refundNotificationsService.bankFailed(payment.id).catch((error) =>
			logger.error("Bank-failure student email failed", {
				paymentId: payment.id,
				error,
			}),
		);
		await adminAlertService.bankFailure(payment.id).catch((error) =>
			logger.error("Bank-failure admin email failed", {
				paymentId: payment.id,
				error,
			}),
		);
	}
}

export const bankFailureService = new BankFailureService();
