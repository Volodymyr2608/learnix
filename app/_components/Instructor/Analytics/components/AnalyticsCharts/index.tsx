"use client";

import { useState } from "react";
import RangeSelect from "@/app/_components/Instructor/_shared/RangeSelect";
import type { StatsRange } from "@/server/entities/stats/range";
import { api } from "@/trpc/client";
import CompletionTrendChart from "../CompletionTrendChart";
import EnrollmentsByCourseChart from "../EnrollmentsByCourseChart";
import EnrollmentTrendChart from "../EnrollmentTrendChart";

export default function AnalyticsCharts() {
	const [range, setRange] = useState<StatsRange>("12m");
	const trend = api.analytics.getEnrollmentTrend.useQuery({ range });
	const completion = api.analytics.getCompletionTrend.useQuery({ range });
	const byCourse = api.analytics.getEnrollmentsByCourse.useQuery({ range });

	return (
		<div className="space-y-6">
			<div className="flex justify-end">
				<RangeSelect onChange={setRange} value={range} />
			</div>
			<EnrollmentTrendChart data={trend.data} isLoading={trend.isLoading} />
			<div className="grid gap-6 lg:grid-cols-2">
				<EnrollmentsByCourseChart
					data={byCourse.data}
					isLoading={byCourse.isLoading}
				/>
				<CompletionTrendChart
					data={completion.data}
					isLoading={completion.isLoading}
				/>
			</div>
		</div>
	);
}
