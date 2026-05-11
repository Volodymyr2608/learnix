import { courseRepository } from "@/server/repositories/course.repository";
import { embeddingRepository } from "@/server/repositories/embedding.repository";
import { enrollmentRepository } from "@/server/repositories/enrollment.repository";
import { logger } from "@/server/utils/logger";
import { SearchError } from "./search.errors";

const MIN_RECOMMENDATIONS = 3;

class RecommendationsService {
	async forUser(userId: string, limit = 10) {
		try {
			const interest = await embeddingRepository.findUserInterest(userId);
			if (!interest) return [];

			const enrolledIds =
				await enrollmentRepository.findEnrolledCourseIds(userId);
			const rows = await embeddingRepository.searchCoursesExcluding(
				interest,
				limit,
				enrolledIds,
			);

			if (rows.length < MIN_RECOMMENDATIONS) return [];

			return courseRepository.findManyByIdsPreservingOrder(
				rows.map((r) => r.id),
			);
		} catch (error) {
			logger.error("Recommendations failed:", error);
			throw new SearchError(
				"Failed to fetch recommendations",
				"INTERNAL_SERVER_ERROR",
				error,
				{ userId },
			);
		}
	}
}

export const recommendationsService = new RecommendationsService();
