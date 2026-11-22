import type {
	CertificateRevocationReason,
	Payment,
	Prisma,
} from "@/generated/prisma";
import { learningRecordsRepository } from "./learningRecords.repository";

/**
 * FR-P6–P13 — the database half of a refund's effects. Runs inside the caller's transaction, and
 * only after `claimRefund` won the compare-and-set, so every effect happens once (C8).
 */
export const refundEffectsRepository = {
	/**
	 * ADR-037 §4 (as amended): `succeeded → refunded` in one conditional update. Only the caller
	 * whose update changes the row applies the effects; returns the payment, or null if it lost.
	 */
	async claimRefund(
		tx: Prisma.TransactionClient,
		paymentId: string,
		now: Date,
	): Promise<Payment | null> {
		const changed = await tx.$executeRaw`
			UPDATE payments
			   SET status = 'refunded', refunded_at = ${now}::timestamp, updated_at = ${now}::timestamp
			 WHERE id = ${paymentId} AND status = 'succeeded'`;
		if (changed !== 1) return null;
		return tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
	},

	async applyInTx(
		tx: Prisma.TransactionClient,
		payment: Payment,
		reason: CertificateRevocationReason,
		now: Date,
	): Promise<void> {
		const { id, studentId, courseId } = payment;

		// FR-P7: a held share is cancelled; a released one is reversed after commit.
		await tx.payment.updateMany({
			where: { id, transferStatus: "pending" },
			data: { transferStatus: "cancelled" },
		});
		// FR-S20 → refunded: a processing request on this payment is done.
		await tx.refundRequest.updateMany({
			where: { paymentId: id, refundState: "processing" },
			data: { refundState: "refunded", refundedAt: now },
		});

		// FR-P8 (DC): while another paid purchase of the course stands, the student keeps the
		// course — and with it the records, certificate, conversation and review.
		const otherPaid = await tx.payment.count({
			where: { studentId, courseId, status: "succeeded", id: { not: id } },
		});
		if (otherPaid > 0) return;

		await tx.enrollment.updateMany({
			where: { studentId, courseId },
			data: { status: "cancelled" },
		});
		await learningRecordsRepository.clearForRefund(tx, studentId, courseId);
		// FR-P10 / E2: completedAt stays (A11, R8); the revocation hides the certificate.
		await tx.enrollment.updateMany({
			where: {
				studentId,
				courseId,
				completedAt: { not: null },
				certificateRevokedAt: null,
			},
			data: { certificateRevokedAt: now, certificateRevokedReason: reason },
		});
		// FR-P11 / D1.
		await tx.conversation.updateMany({
			where: { studentId, courseId, closedAt: null },
			data: { closedAt: now },
		});
		// FR-P13 / R11.
		await tx.courseReview.updateMany({
			where: { studentId, courseId, deletedAt: null },
			data: { deletedAt: now },
		});
	},
};
