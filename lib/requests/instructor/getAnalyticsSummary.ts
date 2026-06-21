import type { AnalyticsSummary } from "@/server/entities/analytics/analytics";
import { api } from "@/trpc/server";

const EMPTY: AnalyticsSummary = {
	enrollments: { value: 0, delta: { kind: "none" } },
	activeLearners: { value: 0, delta: { kind: "none" } },
	avgProgress: { value: 0, delta: { kind: "none" } },
	quizPassRate: { value: 0, attempts: 0, delta: { kind: "none" } },
};

const getAnalyticsSummary = async (): Promise<AnalyticsSummary> => {
	try {
		return await api.analytics.getOverviewSummary();
	} catch (error) {
		console.error("Error fetching analytics summary:", error);
		return EMPTY;
	}
};

export default getAnalyticsSummary;
