import { z } from "zod";
import type { StatDelta } from "@/server/entities/instructor/dashboard";
import {
	type StatsRange,
	statsRangeInput,
	statsRangeSchema,
} from "@/server/entities/stats/range";

export const revenueRangeSchema = statsRangeSchema;
export type RevenueRange = StatsRange;
export const revenueRangeInput = statsRangeInput;
export const recentTransactionsInput = z.object({
	limit: z.number().int().min(1).max(50).default(10),
});

export type RevenueSummary = {
	totalGrossCents: number;
	thisMonth: { grossCents: number; delta: StatDelta };
	paidOutCents: number;
	pendingCents: number;
};

export type RevenueTimeSeriesPoint = {
	period: string; // ISO date marking the bucket start
	grossCents: number;
	netCents: number;
};

export type RevenueByCourseItem = {
	courseId: string;
	title: string;
	grossCents: number;
};

export type RevenueTransactionStatus =
	| "completed"
	| "pending"
	| "refunded"
	| "failed";

export type RevenueTransaction = {
	id: string;
	courseTitle: string;
	studentName: string;
	createdAt: Date;
	amountCents: number;
	status: RevenueTransactionStatus;
};
