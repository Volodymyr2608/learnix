import type { RevenueRange } from "@/server/entities/payment/revenue";

export const RANGE_OPTIONS: { value: RevenueRange; label: string }[] = [
	{ value: "30d", label: "Last 30 days" },
	{ value: "6m", label: "Last 6 months" },
	{ value: "12m", label: "Last 12 months" },
];
