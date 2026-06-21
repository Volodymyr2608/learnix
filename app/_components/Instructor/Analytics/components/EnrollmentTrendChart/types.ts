import type { EnrollmentTrendPoint } from "@/server/entities/analytics/analytics";

export type EnrollmentTrendChartProps = {
	data: EnrollmentTrendPoint[] | undefined;
	isLoading: boolean;
};
