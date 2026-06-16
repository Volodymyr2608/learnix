import type { RevenueTimeSeriesPoint } from "@/server/entities/payment/revenue";

export type RevenueOverTimeChartProps = {
	data: RevenueTimeSeriesPoint[] | undefined;
	isLoading: boolean;
};
