import type {
	GetReviewStatsInput,
	ReviewStats,
} from "@/server/entities/instructor/reviews";
import { api } from "@/trpc/server";

const empty: ReviewStats = {
	average: null,
	total: 0,
	fiveStarPercent: 0,
	lowRatingCount: 0,
	distribution: [5, 4, 3, 2, 1].map((star) => ({
		star,
		count: 0,
		percent: 0,
	})),
};

const getReviewStats = async (
	input: GetReviewStatsInput,
): Promise<ReviewStats> => {
	try {
		return (await api.instructor.getReviewStats(input)) ?? empty;
	} catch (error) {
		console.error("Error fetching review stats:", error);
		return empty;
	}
};

export default getReviewStats;
