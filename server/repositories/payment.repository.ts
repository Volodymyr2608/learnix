import type {
	DisputeState,
	Payment,
	Prisma,
	ProcessedStripeEvent,
} from "@/generated/prisma";
import { getMonthWindows } from "@/lib/stats/monthWindows";
import { BaseRepository } from "./base/base.repository";

class ProcessedStripeEventRepository extends BaseRepository<
	"processedStripeEvent",
	ProcessedStripeEvent,
	Prisma.ProcessedStripeEventUncheckedCreateInput,
	Prisma.ProcessedStripeEventUpdateInput,
	Prisma.ProcessedStripeEventWhereInput,
	never,
	Prisma.ProcessedStripeEventSelect,
	Prisma.ProcessedStripeEventOrderByWithRelationInput
> {
	protected readonly modelName = "processedStripeEvent" as const;

	async exists(id: string): Promise<boolean> {
		return (await this.count({ id })) > 0;
	}

	async record(id: string, type: string): Promise<void> {
		await this.create({ id, type });
	}
}

export const processedStripeEventRepository =
	new ProcessedStripeEventRepository();

class PaymentRepository extends BaseRepository<
	"payment",
	Payment,
	Prisma.PaymentUncheckedCreateInput,
	Prisma.PaymentUpdateInput,
	Prisma.PaymentWhereInput,
	Prisma.PaymentInclude,
	Prisma.PaymentSelect,
	Prisma.PaymentOrderByWithRelationInput
> {
	protected readonly modelName = "payment" as const;

	findBySessionId(stripeCheckoutSessionId: string) {
		return this.findFirst({ where: { stripeCheckoutSessionId } });
	}

	/** C28: the session is looked up by id AND its student in one query. */
	findBySessionIdForStudent(
		stripeCheckoutSessionId: string,
		studentId: string,
	) {
		return this.findFirst({ where: { stripeCheckoutSessionId, studentId } });
	}

	/**
	 * FR-P18a (D2): stores a dispute state from a Stripe event unless a newer event already set
	 * one — webhook and replay deliver out of order. Returns the payment id when it applied.
	 */
	async recordDisputeState(
		stripePaymentIntentId: string,
		state: DisputeState,
		eventCreated: number,
	): Promise<string | null> {
		const rows = await this.db.$queryRaw<{ id: string }[]>`
			UPDATE payments
			   SET dispute_state = ${state}::"DisputeState", dispute_updated_at = ${eventCreated}
			 WHERE stripe_payment_intent_id = ${stripePaymentIntentId}
			   AND (
			     dispute_updated_at IS NULL
			     OR dispute_updated_at < ${eventCreated}
			     -- qa #1: in the same second a closed state is never replaced by open; an equal
			     -- event is still re-applied, so a lost dispute whose effects failed is retried.
			     OR (dispute_updated_at = ${eventCreated}
			         AND (dispute_state = 'open' OR ${state}::"DisputeState" <> 'open'))
			   )
			RETURNING id`;
		return rows[0]?.id ?? null;
	}

	/** FR-P18: Stripe says the charge is disputed before its dispute event arrived. */
	async markDisputeOpen(paymentId: string): Promise<void> {
		await this.db.payment.updateMany({
			where: { id: paymentId, disputeState: null },
			data: { disputeState: "open" },
		});
	}

	/** U10: what the student's "refund done" email needs — no Stripe fields. */
	findForRefundEmail(paymentId: string) {
		return this.db.payment.findUnique({
			where: { id: paymentId },
			select: {
				id: true,
				amountCents: true,
				currency: true,
				student: { select: { id: true, email: true, name: true } },
				course: { select: { title: true } },
				refundRequest: { select: { approval: true } },
			},
		});
	}

	/** V15 / FR-A7: flag a payment refunded in the Stripe Dashboard for an admin to look at. */
	markNeedsReview(paymentId: string, now: Date) {
		return this.db.payment.updateMany({
			where: { id: paymentId, needsReviewAt: null },
			data: { needsReviewAt: now },
		});
	}

	clearNeedsReview(paymentId: string) {
		return this.db.payment.updateMany({
			where: { id: paymentId },
			data: { needsReviewAt: null },
		});
	}

	/** V15: flagged payments, oldest flag first — what the admin list shows. */
	findNeedsReview() {
		return this.db.payment.findMany({
			where: { needsReviewAt: { not: null } },
			orderBy: { needsReviewAt: "asc" },
			select: {
				id: true,
				status: true,
				amountCents: true,
				currency: true,
				needsReviewAt: true,
				refundedAt: true,
				course: { select: { title: true } },
				student: { select: { name: true } },
			},
		});
	}

	/** V16: what a payment notice names — the course, the amount and the student's contact. */
	findForNotice(paymentId: string) {
		return this.db.payment.findUnique({
			where: { id: paymentId },
			select: {
				id: true,
				amountCents: true,
				currency: true,
				course: { select: { title: true } },
				student: { select: { id: true, email: true, name: true } },
			},
		});
	}

	/** V14: what the exception refund checks before it touches Stripe. */
	findForException(paymentId: string) {
		return this.db.payment.findUnique({
			where: { id: paymentId },
			select: {
				id: true,
				status: true,
				stripePaymentIntentId: true,
				disputeState: true,
				refundRequest: {
					select: { refundState: true, appeal: { select: { status: true } } },
				},
			},
		});
	}

	findByPaymentIntentId(stripePaymentIntentId: string) {
		return this.findFirst({ where: { stripePaymentIntentId } });
	}

	async getOwedBalance(instructorId: string): Promise<number> {
		const r = await this.aggregate({
			where: { instructorId, transferStatus: "pending" },
			_sum: { instructorNetCents: true },
		});
		return r._sum.instructorNetCents ?? 0;
	}

	async getPlatformRevenue(): Promise<number> {
		const r = await this.aggregate({
			where: { status: "succeeded", refundedAt: null },
			_sum: { platformFeeCents: true },
		});
		return r._sum.platformFeeCents ?? 0;
	}

	async getInstructorRevenueStats(instructorId: string): Promise<{
		lifetimeGrossCents: number;
		thisMonthGrossCents: number;
		lastMonthGrossCents: number;
	}> {
		const { startThisMonth, startLastMonth, startNextMonth } =
			getMonthWindows();
		const base = {
			instructorId,
			status: "succeeded" as const,
			refundedAt: null,
		};

		const [lifetime, thisMonth, lastMonth] = await Promise.all([
			this.aggregate({ where: base, _sum: { amountCents: true } }),
			this.aggregate({
				where: {
					...base,
					createdAt: { gte: startThisMonth, lt: startNextMonth },
				},
				_sum: { amountCents: true },
			}),
			this.aggregate({
				where: {
					...base,
					createdAt: { gte: startLastMonth, lt: startThisMonth },
				},
				_sum: { amountCents: true },
			}),
		]);

		return {
			lifetimeGrossCents: lifetime._sum.amountCents ?? 0,
			thisMonthGrossCents: thisMonth._sum.amountCents ?? 0,
			lastMonthGrossCents: lastMonth._sum.amountCents ?? 0,
		};
	}

	async getRevenueByBucket(
		instructorId: string,
		since: Date,
		bucket: "day" | "month",
	): Promise<{ period: Date; grossCents: number; netCents: number }[]> {
		const rows = await this.db.$queryRaw<
			{ period: Date; gross: bigint | null; net: bigint | null }[]
		>`
			SELECT date_trunc(${bucket}, created_at) AS period,
			       SUM(amount_cents) AS gross,
			       SUM(instructor_net_cents) AS net
			FROM payments
			WHERE "instructorId" = ${instructorId}
			  AND status = 'succeeded'
			  AND refunded_at IS NULL
			  AND created_at >= ${since}
			GROUP BY period
			ORDER BY period ASC
		`;
		return rows.map((r) => ({
			period: r.period,
			grossCents: Number(r.gross ?? 0),
			netCents: Number(r.net ?? 0),
		}));
	}

	async getRevenueGroupedByCourse(
		instructorId: string,
		since: Date,
		limit: number,
	): Promise<{ courseId: string; grossCents: number }[]> {
		const grouped = await this.db.payment.groupBy({
			by: ["courseId"],
			where: {
				instructorId,
				status: "succeeded",
				refundedAt: null,
				createdAt: { gte: since },
			},
			_sum: { amountCents: true },
			orderBy: { _sum: { amountCents: "desc" } },
			take: limit,
		});
		return grouped.map((g) => ({
			courseId: g.courseId,
			grossCents: g._sum.amountCents ?? 0,
		}));
	}

	async getRevenueByCourseIds(
		courseIds: string[],
	): Promise<Map<string, number>> {
		if (courseIds.length === 0) return new Map();
		const grouped = await this.db.payment.groupBy({
			by: ["courseId"],
			where: {
				courseId: { in: courseIds },
				status: "succeeded",
				refundedAt: null,
			},
			_sum: { amountCents: true },
		});
		return new Map(grouped.map((g) => [g.courseId, g._sum.amountCents ?? 0]));
	}

	findPurchasesByStudent(studentId: string) {
		return this.findMany({
			where: { studentId, status: { in: ["succeeded", "refunded"] } },
			include: {
				course: { select: { id: true, title: true } },
				instructor: { select: { name: true } },
				// U7: the refund row state needs the request's status, never its text or Stripe ids.
				refundRequest: { select: { decision: true, refundState: true } },
			},
			orderBy: { createdAt: "desc" },
		});
	}

	findInvoiceData(paymentId: string) {
		return this.findFirst({
			where: { id: paymentId },
			include: {
				course: { select: { title: true } },
				student: { select: { name: true, email: true } },
			},
		});
	}
}

export const paymentRepository = new PaymentRepository();
