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
}

export const courseReviewRepository = new CourseReviewRepository();
