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

	/** M1: a scheduled or manual run writes its row as it starts. */
	async start(trigger: PayoutRunTrigger, startedAt: Date): Promise<PayoutRun> {
		return this.db.payoutRun.create({ data: { trigger, startedAt } });
	}

	async finish(
		id: string,
		run: {
			processed: number;
			released: number;
			failures: { paymentId: string; error: string }[];
			paymentIds: string[];
			refundsRetried: number;
			eventsReplayed: number;
		},
	): Promise<PayoutRun> {
		return this.db.payoutRun.update({
			where: { id },
			data: { ...run, finishedAt: new Date() },
		});
	}

	/** M1: a run that threw is finished with its error. */
	async fail(id: string, error: string): Promise<void> {
		await this.db.payoutRun.update({
			where: { id },
			data: { error, finishedAt: new Date() },
		});
	}

	/** The newest scheduled or manual run, finished or not (account.updated runs are not the job). */
	findLatest(): Promise<PayoutRun | null> {
		return this.db.payoutRun.findFirst({
			where: { trigger: { in: ["cron", "manual"] } },
			orderBy: { startedAt: "desc" },
		});
	}

	/** M2: the newest cron or manual run that finished without an error. */
	findLastSuccessful(): Promise<PayoutRun | null> {
		return this.db.payoutRun.findFirst({
			where: {
				trigger: { in: ["cron", "manual"] },
				finishedAt: { not: null },
				error: null,
			},
			orderBy: { startedAt: "desc" },
		});
	}

	findHistory(limit: number): Promise<PayoutRun[]> {
		return this.db.payoutRun.findMany({
			orderBy: { startedAt: "desc" },
			take: limit,
		});
	}
}

export const payoutRunRepository = new PayoutRunRepository();
