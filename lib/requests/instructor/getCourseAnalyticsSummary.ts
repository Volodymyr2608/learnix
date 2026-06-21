import type { CourseAnalyticsSummary } from "@/server/entities/analytics/analytics";
import { api } from "@/trpc/server";

const getCourseAnalyticsSummary = async (
	courseId: string,
): Promise<CourseAnalyticsSummary | null> => {
	try {
		return await api.analytics.getCourseSummary({ courseId });
	} catch (error) {
		console.error("Error fetching course analytics summary:", error);
		return null;
	}
};

export default getCourseAnalyticsSummary;
