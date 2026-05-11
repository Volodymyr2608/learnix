import { courseRepository } from "@/server/repositories/course.repository";
import { embeddingRepository } from "@/server/repositories/embedding.repository";
import { enrollmentRepository } from "@/server/repositories/enrollment.repository";

const MIN_RECOMMENDATIONS = 3;

class RecommendationsService {
	async forUser(userId: string, limit = 10) {
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

		return courseRepository.findManyByIdsPreservingOrder(rows.map((r) => r.id));
	}
}

export const recommendationsService = new RecommendationsService();
