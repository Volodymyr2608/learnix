import { safeRequest } from "@/lib/requests/_shared/safeRequest";
import type { CourseAnalyticsSummary } from "@/server/entities/analytics/analytics";
import { api } from "@/trpc/server";

const getCourseAnalyticsSummary = async (
	courseId: string,
): Promise<CourseAnalyticsSummary | null> => {
	return safeRequest(
		"instructor.getCourseAnalyticsSummary",
		async () => {
			return await api.analytics.getCourseSummary({ courseId });
		},
		null,
	);
};

export default getCourseAnalyticsSummary;
