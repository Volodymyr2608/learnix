import { z } from "zod";

export const statsRangeSchema = z.enum(["30d", "6m", "12m"]);
export type StatsRange = z.infer<typeof statsRangeSchema>;

export const statsRangeInput = z.object({ range: statsRangeSchema });

export const STATS_RANGE_OPTIONS: { value: StatsRange; label: string }[] = [
	{ value: "30d", label: "Last 30 days" },
	{ value: "6m", label: "Last 6 months" },
	{ value: "12m", label: "Last 12 months" },
];