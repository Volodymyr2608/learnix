import { db } from "@/server/db";

/** FR-P15: how far the daily job has replayed one Stripe event type (Unix seconds). */
export const stripeReplayCursorRepository = {
	async get(eventType: string): Promise<number | null> {
		const row = await db.stripeReplayCursor.findUnique({
			where: { id: eventType },
		});
		return row?.lastEventCreated ?? null;
	},

	async save(eventType: string, lastEventCreated: number): Promise<void> {
		await db.stripeReplayCursor.upsert({
			where: { id: eventType },
			create: { id: eventType, lastEventCreated },
			update: { lastEventCreated },
		});
	},
};
