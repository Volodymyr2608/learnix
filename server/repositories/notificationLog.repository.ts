import { Prisma, type NotificationLog } from "@/generated/prisma";
import { BaseRepository } from "./base/base.repository";

class NotificationLogRepository extends BaseRepository<
	"notificationLog",
	NotificationLog,
	Prisma.NotificationLogUncheckedCreateInput,
	Prisma.NotificationLogUpdateInput,
	Prisma.NotificationLogWhereInput,
	Prisma.NotificationLogInclude,
	Prisma.NotificationLogSelect,
	Prisma.NotificationLogOrderByWithRelationInput
> {
	protected readonly modelName = "notificationLog" as const;

	async tryLog(input: {
		dedupKey: string;
		userId: string;
		automation: string;
		payload?: unknown;
	}): Promise<{ created: true; row: NotificationLog } | { created: false }> {
		try {
			const row = await this.createRaw({
				dedupKey: input.dedupKey,
				userId: input.userId,
				automation: input.automation,
				payload: (input.payload ?? {}) as Prisma.InputJsonValue,
			});
			return { created: true, row };
		} catch (e) {
			if (
				e != null &&
				typeof e === "object" &&
				"code" in e &&
				e.code === "P2002"
			) {
				return { created: false };
			}
			throw e;
		}
	}

	async deleteByDedupKey(dedupKey: string) {
		return this.deleteMany({ dedupKey });
	}
}

export const notificationLogRepository = new NotificationLogRepository();