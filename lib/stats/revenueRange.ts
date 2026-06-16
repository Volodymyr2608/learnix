import { subDays, subMonths } from "date-fns";
import type { RevenueRange } from "@/server/entities/payment/revenue";

export type ResolvedRange = { since: Date; bucket: "day" | "month" };

/** Maps a range preset to its query window start and time-bucket unit. */
export function resolveRange(
	range: RevenueRange,
	now: Date = new Date(),
): ResolvedRange {
	if (range === "30d") {
		return { since: subDays(now, 30), bucket: "day" };
	}
	const monthsBack = range === "6m" ? 5 : 11;
	const start = subMonths(now, monthsBack);
	return {
		since: new Date(start.getFullYear(), start.getMonth(), 1),
		bucket: "month",
	};
}
