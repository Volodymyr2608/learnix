import type { Payment, Prisma } from "@/generated/prisma";
import { getMonthWindows } from "@/lib/stats/monthWindows";
import { db } from "@/server/db";
import { BaseRepository } from "./base/base.repository";

class ProcessedStripeEventRepository {
	async exists(id: string): Promise<boolean> {
		const count = await db.processedStripeEvent.count({ where: { id } });
		return count > 0;
	}

	async record(id: string, type: string): Promise<void> {
		await db.processedStripeEvent.create({ data: { id, type } });
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
		const rows = await db.$queryRaw<
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
		const grouped = await db.payment.groupBy({
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
		const grouped = await db.payment.groupBy({
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
}

export const paymentRepository = new PaymentRepository();
