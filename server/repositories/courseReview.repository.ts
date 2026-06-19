import type { CourseReview, Prisma } from "@/generated/prisma";
import type { ReviewRow } from "@/server/entities/instructor/reviews";
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
			grouped.map(
				(g: { courseId: string; _avg: { rating: number | null } }) => [
					g.courseId,
					g._avg.rating,
				],
			),
		);
	}

	async findRecentByInstructor(
		instructorId: string,
		take: number,
	): Promise<
		{
			id: string;
			studentName: string;
			courseTitle: string;
			rating: number;
			createdAt: Date;
		}[]
	> {
		const rows = await this.findMany({
			where: {
				deletedAt: null,
				course: { is: { instructorId, deletedAt: null } },
			},
			orderBy: { createdAt: "desc" },
			take,
			select: {
				id: true,
				rating: true,
				createdAt: true,
				student: { select: { name: true } },
				course: { select: { title: true } },
			},
		});
		return rows.map((r) => ({
			id: r.id,
			studentName: r.student.name,
			courseTitle: r.course.title,
			rating: r.rating,
			createdAt: r.createdAt,
		}));
	}

	findByStudentAndCourse(
		studentId: string,
		courseId: string,
	): Promise<CourseReview | null> {
		return this.findFirst({
			where: { studentId, courseId, deletedAt: null },
		});
	}

	async getInstructorReviewStats(
		instructorId: string,
		courseId?: string,
	): Promise<{
		average: number | null;
		total: number;
		fiveStarCount: number;
		lowRatingCount: number;
		perStar: Map<number, number>;
	}> {
		const grouped = await this.model.groupBy({
			by: ["rating"],
			where: {
				deletedAt: null,
				course: { is: { instructorId, deletedAt: null } },
				...(courseId ? { courseId } : {}),
			},
			_count: { _all: true },
		});

		const perStar = new Map<number, number>();
		let total = 0;
		let weighted = 0;
		for (const g of grouped as { rating: number; _count: { _all: number } }[]) {
			const count = g._count._all;
			perStar.set(g.rating, count);
			total += count;
			weighted += g.rating * count;
		}

		return {
			average: total > 0 ? weighted / total : null,
			total,
			fiveStarCount: perStar.get(5) ?? 0,
			lowRatingCount: (perStar.get(1) ?? 0) + (perStar.get(2) ?? 0),
			perStar,
		};
	}

	async findInstructorReviews(params: {
		instructorId: string;
		courseId?: string;
		rating?: number;
		page: number;
		perPage: number;
	}): Promise<{ rows: ReviewRow[]; total: number }> {
		const { instructorId, courseId, rating, page, perPage } = params;
		const where: Prisma.CourseReviewWhereInput = {
			deletedAt: null,
			course: { is: { instructorId, deletedAt: null } },
			...(courseId ? { courseId } : {}),
			...(rating ? { rating } : {}),
		};

		const [rows, total] = await Promise.all([
			this.findMany({
				where,
				orderBy: { createdAt: "desc" },
				skip: (page - 1) * perPage,
				take: perPage,
				select: {
					id: true,
					rating: true,
					comment: true,
					tags: true,
					createdAt: true,
					student: { select: { name: true, image: true } },
					course: { select: { title: true } },
				},
			}),
			this.model.count({ where }),
		]);

		return {
			rows: rows.map((r) => ({
				id: r.id,
				studentName: r.student.name,
				studentImage: r.student.image,
				courseTitle: r.course.title,
				rating: r.rating,
				comment: r.comment,
				tags: r.tags,
				createdAt: r.createdAt,
			})),
			total,
		};
	}

	countNewByInstructor(
		instructorId: string,
		since: Date | null,
	): Promise<number> {
		return this.model.count({
			where: {
				deletedAt: null,
				course: { is: { instructorId, deletedAt: null } },
				...(since ? { createdAt: { gt: since } } : {}),
			},
		});
	}

	async getInstructorReviewCourseOptions(
		instructorId: string,
	): Promise<{ id: string; title: string }[]> {
		const rows = await this.findMany({
			where: {
				deletedAt: null,
				course: { is: { instructorId, deletedAt: null } },
			},
			distinct: ["courseId"],
			orderBy: { courseId: "asc" },
			select: { course: { select: { id: true, title: true } } },
		});
		return rows.map((r) => ({ id: r.course.id, title: r.course.title }));
	}
}

export const courseReviewRepository = new CourseReviewRepository();
