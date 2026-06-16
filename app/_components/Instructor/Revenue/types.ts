import type * as React from "react";
import type { StatDelta } from "@/server/entities/instructor/dashboard";
import type {
	RevenueByCourseItem,
	RevenueRange,
	RevenueSummary,
	RevenueTimeSeriesPoint,
	RevenueTransaction,
} from "@/server/entities/payment/revenue";

export type RevenueSummaryCardsProps = {
	summary: RevenueSummary | undefined;
	isLoading: boolean;
};
export type StatCardProps = {
	label: string;
	value: string;
	icon: React.ReactNode;
	iconWrapperClassName: string;
	subline?: React.ReactNode;
};
export type DeltaBadgeProps = { delta: StatDelta };

export type RevenuePayoutsProps = {
	paidOutCents: number;
	pendingCents: number;
	isLoading: boolean;
};

export type RevenueRangeSelectProps = {
	value: RevenueRange;
	onChange: (range: RevenueRange) => void;
};

export type RevenueOverTimeChartProps = {
	data: RevenueTimeSeriesPoint[] | undefined;
	isLoading: boolean;
};
export type RevenueByCourseChartProps = {
	data: RevenueByCourseItem[] | undefined;
	isLoading: boolean;
};
export type RevenueTransactionsTableProps = {
	transactions: RevenueTransaction[] | undefined;
	isLoading: boolean;
};
