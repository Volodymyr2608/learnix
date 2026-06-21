import { PageShell } from "@/app/_components/_shared/components/PageShell";
import TopPerformingCourses from "@/app/_components/Instructor/TopPerformingCourses";
import getAnalyticsSummary from "@/lib/requests/instructor/getAnalyticsSummary";
import getTopPerformingCourses from "@/lib/requests/instructor/getTopPerformingCourses";
import AnalyticsCharts from "./components/AnalyticsCharts";
import AnalyticsSummaryCards from "./components/AnalyticsSummaryCards";

export default async function AnalyticsOverview() {
	const [summary, topCourses] = await Promise.all([
		getAnalyticsSummary(),
		getTopPerformingCourses(),
	]);

	return (
		<PageShell
			description="Understand how students discover and engage with your courses."
			title="Analytics"
		>
			<AnalyticsSummaryCards summary={summary} />
			<AnalyticsCharts />
			<TopPerformingCourses courses={topCourses} />
		</PageShell>
	);
}
