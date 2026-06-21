"use client";

import { useState } from "react";
import RangeSelect from "@/app/_components/Instructor/_shared/RangeSelect";
import EnrollmentTrendChart from "@/app/_components/Instructor/Analytics/components/EnrollmentTrendChart";
import type { StatsRange } from "@/server/entities/stats/range";
import { api } from "@/trpc/client";
import type { CourseAnalyticsChartsProps } from "./types";

export default function CourseAnalyticsCharts({
	courseId,
}: CourseAnalyticsChartsProps) {
	const [range, setRange] = useState<StatsRange>("12m");
	const trend = api.analytics.getCourseEnrollmentTrend.useQuery({
		courseId,
		range,
	});

	return (
		<div className="space-y-6">
			<div className="flex justify-end">
				<RangeSelect onChange={setRange} value={range} />
			</div>
			<EnrollmentTrendChart data={trend.data} isLoading={trend.isLoading} />
		</div>
	);
}
