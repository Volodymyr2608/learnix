import type { Payment, Prisma } from "@/generated/prisma";
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
}

export const paymentRepository = new PaymentRepository();
