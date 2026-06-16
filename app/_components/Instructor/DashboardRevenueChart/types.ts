// app/_components/Instructor/DashboardRevenueChart/types.ts
import type { RevenueTimeSeriesPoint } from "@/server/entities/payment/revenue";

export type DashboardRevenueChartProps = {
	data: RevenueTimeSeriesPoint[];
};
