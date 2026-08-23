// lib/requests/instructor/getRevenueTimeSeries.ts

import { safeRequest } from "@/lib/requests/_shared/safeRequest";
import type { RevenueTimeSeriesPoint } from "@/server/entities/payment/revenue";
import { api } from "@/trpc/server";

/** Default-range (last 12 months) revenue series for the dashboard chart.
 *  Degrades to an empty series on failure, mirroring getDashboardStats. */
const getRevenueTimeSeries = async (): Promise<RevenueTimeSeriesPoint[]> => {
	return safeRequest("instructor.getRevenueTimeSeries", async () => {
		return await api.payment.getRevenueTimeSeries({ range: "12m" });
	}, []);
};

export default getRevenueTimeSeries;
