import type { EnrollmentsByCourseItem } from "@/server/entities/analytics/analytics";

export type EnrollmentsByCourseChartProps = {
	data: EnrollmentsByCourseItem[] | undefined;
	isLoading: boolean;
};
