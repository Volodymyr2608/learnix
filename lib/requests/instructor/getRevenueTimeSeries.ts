// lib/requests/instructor/getRevenueTimeSeries.ts
import type { RevenueTimeSeriesPoint } from "@/server/entities/payment/revenue";
import { api } from "@/trpc/server";

/** Default-range (last 12 months) revenue series for the dashboard chart.
 *  Degrades to an empty series on failure, mirroring getDashboardStats. */
const getRevenueTimeSeries = async (): Promise<RevenueTimeSeriesPoint[]> => {
	try {
		return await api.payment.getRevenueTimeSeries({ range: "12m" });
	} catch (error) {
		console.error("Error fetching instructor revenue series:", error);
		return [];
	}
};

export default getRevenueTimeSeries;
