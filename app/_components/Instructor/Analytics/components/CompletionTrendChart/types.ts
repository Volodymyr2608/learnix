import type { CompletionTrendPoint } from "@/server/entities/analytics/analytics";

export type CompletionTrendChartProps = {
	data: CompletionTrendPoint[] | undefined;
	isLoading: boolean;
};
