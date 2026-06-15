import type { Payment, Prisma } from "@/generated/prisma";
import { BaseRepository } from "./base/base.repository";

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
