import type { PayoutRun, PayoutRunTrigger, Prisma } from "@/generated/prisma";
import { BaseRepository } from "./base/base.repository";

class PayoutRunRepository extends BaseRepository<
	"payoutRun",
	PayoutRun,
	Prisma.PayoutRunUncheckedCreateInput,
	Prisma.PayoutRunUpdateInput,
	Prisma.PayoutRunWhereInput,
	never,
	Prisma.PayoutRunSelect,
	Prisma.PayoutRunOrderByWithRelationInput
> {
	protected readonly modelName = "payoutRun" as const;

	/** FR-P5: one row per run — Hobby keeps logs for an hour, so the outcome lives here. */
	async record(run: {
		trigger: PayoutRunTrigger;
		startedAt: Date;
		finishedAt: Date;
		processed: number;
		released: number;
		failures: { paymentId: string; error: string }[];
		paymentIds: string[];
		refundsRetried?: number;
		eventsReplayed?: number;
	}): Promise<PayoutRun> {
		return this.db.payoutRun.create({ data: run });
	}
}

export const payoutRunRepository = new PayoutRunRepository();
