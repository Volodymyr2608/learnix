"use client";

import { useState } from "react";
import type { RevenueRange } from "@/server/entities/payment/revenue";
import { api } from "@/trpc/client";
import RevenueByCourseChart from "../RevenueByCourseChart";
import RevenueOverTimeChart from "../RevenueOverTimeChart";
import RevenueRangeSelect from "../RevenueRangeSelect";

export default function RevenueCharts() {
	const [range, setRange] = useState<RevenueRange>("12m");

	const series = api.payment.getRevenueTimeSeries.useQuery({ range });
	const byCourse = api.payment.getRevenueByCourse.useQuery({ range });

	return (
		<div className="space-y-4">
			<div className="flex justify-end">
				<RevenueRangeSelect onChange={setRange} value={range} />
			</div>
			<div className="grid gap-6 lg:grid-cols-3">
				<RevenueOverTimeChart data={series.data} isLoading={series.isLoading} />
				<RevenueByCourseChart
					data={byCourse.data}
					isLoading={byCourse.isLoading}
				/>
			</div>
		</div>
	);
}
