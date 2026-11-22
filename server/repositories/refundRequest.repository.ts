import type { Prisma, RefundRequest } from "@/generated/prisma";
import { BaseRepository } from "./base/base.repository";

/**
 * Every method takes the caller's transaction client: the facts are read and the
 * row is written under one per-student advisory lock (C4), so none of them may
 * run on `this.db`.
 */
class RefundRequestRepository extends BaseRepository<
	"refundRequest",
	RefundRequest,
	Prisma.RefundRequestUncheckedCreateInput,
	Prisma.RefundRequestUpdateInput,
	Prisma.RefundRequestWhereInput,
	Prisma.RefundRequestInclude,
	Prisma.RefundRequestSelect,
	Prisma.RefundRequestOrderByWithRelationInput
> {
	protected readonly modelName = "refundRequest" as const;

	/**
	 * C4: serialises every refund request of one student until the transaction
	 * ends. $executeRaw, not $queryRaw: pg_advisory_xact_lock returns `void`,
	 * which $queryRaw cannot deserialise.
	 */
	async lockStudent(
		tx: Prisma.TransactionClient,
		studentId: string,
	): Promise<void> {
		await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`refund:${studentId}`}))`;
	}

	/** C1: the payment is authorised by id AND the session's student in one query. */
	findRequestablePayment(
		tx: Prisma.TransactionClient,
		paymentId: string,
		studentId: string,
	) {
		return tx.payment.findFirst({
			where: { id: paymentId, studentId, status: "succeeded" },
			select: { id: true, courseId: true, paidAt: true },
		});
	}

	async existsForPayment(
		tx: Prisma.TransactionClient,
		paymentId: string,
	): Promise<boolean> {
		return (await tx.refundRequest.count({ where: { paymentId } })) > 0;
	}

	/** P6: a certificate is a completed enrollment. */
	async hasCertificate(
		tx: Prisma.TransactionClient,
		studentId: string,
		courseId: string,
	): Promise<boolean> {
		const count = await tx.enrollment.count({
			where: { studentId, courseId, completedAt: { not: null } },
		});
		return count > 0;
	}

	/** D3 — in this slice a counting refund is an automatic refund. */
	async hasCountingRefund(
		tx: Prisma.TransactionClient,
		studentId: string,
		courseId: string,
	): Promise<boolean> {
		const count = await tx.refundRequest.count({
			where: { studentId, courseId, decision: "auto_approved" },
		});
		return count > 0;
	}

	/** OQ-2 — in this slice an account-limit refund is an automatic refund. */
	countAccountLimitRefunds(
		tx: Prisma.TransactionClient,
		studentId: string,
		since: Date,
	): Promise<number> {
		return tx.refundRequest.count({
			where: {
				studentId,
				decision: "auto_approved",
				createdAt: { gte: since },
			},
		});
	}

	createInTx(
		tx: Prisma.TransactionClient,
		data: Prisma.RefundRequestUncheckedCreateInput,
	) {
		return tx.refundRequest.create({ data, select: { id: true } });
	}
}

export const refundRequestRepository = new RefundRequestRepository();
