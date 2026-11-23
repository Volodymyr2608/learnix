import { z } from "zod";
import { db } from "@/server/db";
import { enrollmentRepository } from "@/server/repositories/enrollment.repository";
import { paymentRepository } from "@/server/repositories/payment.repository";
import { refundAuditRepository } from "@/server/repositories/refundAudit.repository";
import { refundEffectsRepository } from "@/server/repositories/refundEffects.repository";
import { adminAlertService } from "@/server/services/payments/adminAlert.service";
import { logger } from "@/server/utils/logger";
import { BankFailureResolutionError } from "./refund.errors";
import { refundNotificationsService } from "./refundNotifications.service";

const OUTCOME_AUDIT = {
	refunded_elsewhere: "bank_failure_refunded_elsewhere",
	sale_stands: "bank_failure_sale_stands",
} as const;

const note = z
	.string()
	.trim()
	.min(1, "A resolution needs a note")
	.max(2000)
	.refine((v) => !v.includes("\u0000"), "Invalid character");

class BankFailureService {
	/** FR-P27 (W6): the open bank failures the admin must close. */
	async listOpen() {
		const rows = await paymentRepository.findOpenBankFailures();
		return rows.map((p) => ({
			paymentId: p.id,
			courseTitle: p.course.title,
			studentName: p.student.name,
			amountCents: p.amountCents,
			currency: p.currency,
			failedAt: p.bankFailureAt,
		}));
	}

	/**
	 * FR-P27 (W6): the admin's two audited outcomes. "refunded another way" completes the refund
	 * again — the share cancelled while held, access removed (qa #4); "the sale stands" makes the
	 * payment paid again, so its share follows the normal release rule and the request no longer
	 * counts (qa #1). A double charge cannot stand (qa F3).
	 * Exactly once per failure, with one audit row in the same transaction.
	 */
	async resolve(
		adminId: string,
		input: {
			paymentId: string;
			outcome: "refunded_elsewhere" | "sale_stands";
			note: string;
		},
	): Promise<void> {
		const parsed = note.safeParse(input.note);
		if (!parsed.success)
			throw new BankFailureResolutionError(
				"A resolution needs a note",
				"BAD_REQUEST",
			);
		await db.$transaction(async (tx) => {
			const payment = await paymentRepository.resolveBankFailureInTx(
				tx,
				input.paymentId,
				input.outcome,
			);
			if (!payment)
				throw new BankFailureResolutionError(
					"This bank failure is already closed.",
					"CONFLICT",
				);
			// qa F3 / AC-C13: a double charge cannot stand — the instructor would be paid twice.
			if (
				input.outcome === "sale_stands" &&
				payment.refundSource === "duplicate_charge"
			)
				throw new BankFailureResolutionError(
					"A double charge cannot stand; return the money another way.",
					"BAD_REQUEST",
				);
			// qa #4: the money is back with the student, so the refund's effects hold again —
			// access, certificate, conversation; the share is cancelled while held.
			if (input.outcome === "refunded_elsewhere")
				await refundEffectsRepository.applyInTx(
					tx,
					payment,
					payment.refundSource ?? "dashboard_refund",
					new Date(),
				);
			await refundAuditRepository.createInTx(tx, {
				kind: OUTCOME_AUDIT[input.outcome],
				paymentId: input.paymentId,
				adminId,
				reason: parsed.data,
			});
		});
	}

	/**
	 * FR-P27 / FS-3 (W5): a refund that failed at the bank after its effects were applied. Once per
	 * failed Stripe refund: `bank_failure_at` is set, a cancelled share goes back to held (and the
	 * release predicate keeps it there while the failure is open), and the enrollment is
	 * reactivated — cleared learning records stay cleared — in one transaction, so a failed restore
	 * is redone by the redelivered event (C8, qa F2). The student and the admins are told after
	 * commit.
	 */
	async refundFailed(
		paymentIntentId: string,
		stripeRefundId: string,
		now: Date,
	): Promise<void> {
		const payment =
			await paymentRepository.findByPaymentIntentId(paymentIntentId);
		if (!payment) return;
		const marked = await db.$transaction(async (tx) => {
			const won = await paymentRepository.markBankFailureInTx(
				tx,
				payment.id,
				stripeRefundId,
				now,
			);
			if (won)
				await enrollmentRepository.reactivateCancelledInTx(
					tx,
					payment.studentId,
					payment.courseId,
					now,
				);
			return won;
		});
		if (!marked) return;
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
