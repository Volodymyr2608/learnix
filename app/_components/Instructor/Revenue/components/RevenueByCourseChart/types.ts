import type { RevenueByCourseItem } from "@/server/entities/payment/revenue";

export type RevenueByCourseChartProps = {
	data: RevenueByCourseItem[] | undefined;
	isLoading: boolean;
};
