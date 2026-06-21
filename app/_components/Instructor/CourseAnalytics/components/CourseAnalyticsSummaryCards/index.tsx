import AnalyticsSummaryCards from "@/app/_components/Instructor/Analytics/components/AnalyticsSummaryCards";
import type { CourseAnalyticsSummaryCardsProps } from "./types";

export default function CourseAnalyticsSummaryCards({
	summary,
}: CourseAnalyticsSummaryCardsProps) {
	return <AnalyticsSummaryCards summary={summary} />;
}
