import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/app/_components/_shared/components/PageShell";
import { Button } from "@/app/_components/_shared/ui/button";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import getCourseAnalyticsSummary from "@/lib/requests/instructor/getCourseAnalyticsSummary";
import { api } from "@/trpc/server";
import CourseAnalyticsCharts from "./components/CourseAnalyticsCharts";
import CourseAnalyticsSummaryCards from "./components/CourseAnalyticsSummaryCards";
import LessonCompletionFunnel from "./components/LessonCompletionFunnel";
import type { CourseAnalyticsProps } from "./types";

export default async function CourseAnalytics({
	courseId,
}: CourseAnalyticsProps) {
	const summary = await getCourseAnalyticsSummary(courseId);
	if (!summary) notFound();

	const lessons = await api.analytics.getLessonFunnel({ courseId });

	return (
		<PageShell
			action={
				<Button asChild variant="outline">
					<Link href={INSTRUCTOR_URLS.courses}>Back to courses</Link>
				</Button>
			}
			description="Engagement and drop-off for this course."
			title="Course Analytics"
		>
			<CourseAnalyticsSummaryCards summary={summary} />
			<CourseAnalyticsCharts courseId={courseId} />
			<LessonCompletionFunnel lessons={lessons} />
		</PageShell>
	);
}
