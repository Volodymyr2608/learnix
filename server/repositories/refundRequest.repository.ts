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
		// A refunded payment is found too, so a repeat request on it is CONFLICT (FR-S7), not
		// NOT_FOUND; the service refuses a refunded payment with no request as NOT_FOUND.
		return tx.payment.findFirst({
			where: {
				id: paymentId,
				studentId,
				status: { in: ["succeeded", "refunded"] },
			},
			select: {
				id: true,
				courseId: true,
				paidAt: true,
				status: true,
				disputeState: true,
			},
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

	/**
	 * D3: an earlier counting refund of this course — an approved request, or a bank dispute the
	 * platform lost (DL: the student took the money back themselves).
	 */
	async hasCountingRefund(
		tx: Prisma.TransactionClient,
		studentId: string,
		courseId: string,
	): Promise<boolean> {
		const [requests, lostDisputes] = await Promise.all([
			tx.refundRequest.count({
				where: { studentId, courseId, decision: "auto_approved" },
			}),
			tx.payment.count({
				where: { studentId, courseId, refundSource: "lost_dispute" },
			}),
		]);
		return requests + lostDisputes > 0;
	}

	/**
	 * OQ-2 as amended by DL: account-limit refunds in the window — approved requests and lost
	 * disputes, counted once per payment (D4), so a request later lost at the bank is not double.
	 */
	async countAccountLimitRefunds(
		tx: Prisma.TransactionClient,
		studentId: string,
		since: Date,
	): Promise<number> {
		const rows = await tx.$queryRaw<[{ count: number }]>`
			SELECT COUNT(DISTINCT payment_id)::int AS count FROM (
				SELECT r.payment_id
				  FROM refund_requests r
				 WHERE r.student_id = ${studentId}
				   AND r.decision = 'auto_approved'
				   AND r.created_at >= ${since}::timestamp
				UNION ALL
				SELECT p.id
				  FROM payments p
				 WHERE p."studentId" = ${studentId}
				   AND p.refund_source = 'lost_dispute'
				   AND p.refunded_at >= ${since}::timestamp
			) AS counted`;
		return Number(rows[0]?.count ?? 0);
	}

	createInTx(
		tx: Prisma.TransactionClient,
		data: Prisma.RefundRequestUncheckedCreateInput,
	) {
		return tx.refundRequest.create({ data, select: { id: true } });
	}

	/** FR-S20: the request and the payment fields the Stripe refund needs. */
	findForRefund(requestId: string) {
		return this.db.refundRequest.findUnique({
			where: { id: requestId },
			select: {
				id: true,
				refundState: true,
				payment: {
					select: { id: true, stripePaymentIntentId: true, disputeState: true },
				},
			},
		});
	}

	/** FR-S20 retry: approved requests whose Stripe refund has not succeeded yet, oldest first. */
	async findProcessingIds(limit: number): Promise<string[]> {
		// Audit M-2a: least recently tried first, so requests that cannot finish (a disputed
		// charge) go behind fresh ones instead of filling every batch.
		const rows = await this.db.refundRequest.findMany({
			where: { refundState: "processing" },
			orderBy: [
				{ refundAttemptedAt: { sort: "asc", nulls: "first" } },
				{ createdAt: "asc" },
			],
			take: limit,
			select: { id: true },
		});
		return rows.map((r) => r.id);
	}

	async recordStripeRefund(requestId: string, stripeRefundId: string | null) {
		await this.db.refundRequest.update({
			where: { id: requestId },
			data: { stripeRefundId, refundError: null },
		});
	}

	/** Stripe's message, for the admin only (C23) — never returned to the student. */
	async recordRefundError(requestId: string, refundError: string) {
		await this.db.refundRequest.update({
			where: { id: requestId },
			data: { refundError },
		});
	}

	/** FR-A11: what the day-3 reminders need — no error text is selected for the student. */
	findForReminder(requestId: string) {
		return this.db.refundRequest.findUnique({
			where: { id: requestId },
			select: {
				id: true,
				refundState: true,
				createdAt: true,
				student: { select: { id: true, email: true, name: true } },
				course: { select: { title: true } },
			},
		});
	}

	/** M8: overdue refunds as the admin panel lists them, with Stripe's text (admin-only). */
	async findOverdueForPanel(since: Date) {
		const rows = await this.db.refundRequest.findMany({
			where: { refundState: "processing", createdAt: { lte: since } },
			orderBy: { createdAt: "asc" },
			select: {
				id: true,
				paymentId: true,
				createdAt: true,
				refundError: true,
				payment: { select: { amountCents: true } },
			},
		});
		return rows.map((r) => ({
			requestId: r.id,
			paymentId: r.paymentId,
			amountCents: r.payment.amountCents,
			approvedAt: r.createdAt,
			error: r.refundError,
		}));
	}

	/** FR-A11 (M7): requests still processing since before `since`. */
	async findOverdueIds(since: Date, limit: number): Promise<string[]> {
		const rows = await this.db.refundRequest.findMany({
			where: { refundState: "processing", createdAt: { lte: since } },
			select: { id: true },
			orderBy: { createdAt: "asc" },
			take: limit,
		});
		return rows.map((r) => r.id);
	}

	async hasStripeRefundForPayment(paymentId: string): Promise<boolean> {
		const row = await this.db.refundRequest.findFirst({
			where: { paymentId, stripeRefundId: { not: null } },
			select: { id: true },
		});
		return row !== null;
	}

	async hasProcessingForPayment(paymentId: string): Promise<boolean> {
		const row = await this.db.refundRequest.findFirst({
			where: { paymentId, refundState: "processing" },
			select: { id: true },
		});
		return row !== null;
	}

	async markAttempt(requestId: string, now: Date) {
		await this.db.refundRequest.update({
			where: { id: requestId },
			data: { refundAttemptedAt: now },
		});
	}

	async markRefunded(requestId: string, now: Date) {
		await this.db.refundRequest.updateMany({
			where: { id: requestId, refundState: "processing" },
			data: { refundState: "refunded", refundedAt: now },
		});
	}
}

export const refundRequestRepository = new RefundRequestRepository();
