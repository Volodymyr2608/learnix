import type { CourseReview, Prisma } from "@/generated/prisma";
import { BaseRepository } from "@/server/repositories/base/base.repository";

export default class CourseReviewRepository extends BaseRepository<
	"courseReview",
	CourseReview,
	Prisma.CourseReviewUncheckedCreateInput,
	Prisma.CourseReviewUpdateInput,
	Prisma.CourseReviewWhereInput,
	Prisma.CourseReviewInclude,
	Prisma.CourseReviewSelect,
	Prisma.CourseReviewOrderByWithRelationInput
> {
	protected readonly modelName = "courseReview";

	async getInstructorRatingStats(instructorId: string): Promise<{
		average: number | null;
		reviewCount: number;
	}> {
		const result = await this.aggregate({
			where: {
				deletedAt: null,
				course: { is: { instructorId, deletedAt: null } },
			},
			_avg: { rating: true },
			_count: { _all: true },
		});

		const reviewCount = result._count._all;
		return {
			average: reviewCount > 0 ? (result._avg.rating ?? null) : null,
			reviewCount,
		};
	}

	async getAvgRatingByCourseIds(
		courseIds: string[],
	): Promise<Map<string, number | null>> {
		if (courseIds.length === 0) return new Map();
		const grouped = await this.model.groupBy({
			by: ["courseId"],
			where: { courseId: { in: courseIds }, deletedAt: null },
			_avg: { rating: true },
		});
		return new Map(
			grouped.map((g: { courseId: string; _avg: { rating: number | null } }) => [
				g.courseId,
				g._avg.rating,
			]),
		);
	}
}

export const courseReviewRepository = new CourseReviewRepository();
