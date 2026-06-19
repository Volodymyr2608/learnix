import {
	type Course,
	CourseStatus,
	EnrollmentStatus,
	type Prisma,
} from "@/generated/prisma";
import { COURSE_PAGE_SIZE } from "@/lib/constants/pagination";
import type {
	GetOwnCoursesInput,
	OwnCourseRepoRow,
	Paginated,
} from "@/server/entities/course/ownCourses";
import { BaseRepository } from "@/server/repositories/base/base.repository";
import type CourseReviewRepository from "@/server/repositories/courseReview.repository";
import { courseReviewRepository } from "@/server/repositories/courseReview.repository";
import { enrollmentRepository } from "@/server/repositories/enrollment.repository";
import { lessonRepository } from "@/server/repositories/lesson.repository";
import type QuizRepository from "@/server/repositories/quiz.repository";
import { quizRepository } from "@/server/repositories/quiz.repository";
import type SectionRepository from "@/server/repositories/section.repository";
import { sectionRepository } from "@/server/repositories/section.repository";

export default class CourseRepository extends BaseRepository<
	"course",
	Course,
	Prisma.CourseUncheckedCreateInput,
	Prisma.CourseUpdateInput,
	Prisma.CourseWhereInput,
	Prisma.CourseInclude,
	Prisma.CourseSelect,
	Prisma.CourseOrderByWithRelationInput
> {
	protected readonly modelName = "course" as const;

	private sectionRepository: SectionRepository;
	private lessonRepository: typeof lessonRepository;
	private quizRepository: QuizRepository;
	private enrollmentRepository: typeof enrollmentRepository;
	private courseReviewRepository: CourseReviewRepository;

	constructor() {
		super();
		this.sectionRepository = sectionRepository;
		this.lessonRepository = lessonRepository;
		this.quizRepository = quizRepository;
		this.enrollmentRepository = enrollmentRepository;
		this.courseReviewRepository = courseReviewRepository;
	}

	public async deleteCourse(
		id: string,
		softDelete: boolean = this.isSoftDelete,
	): Promise<boolean> {
		try {
			this.logger?.info("Deleting course", { id, softDelete });

			if (softDelete) {
				const now = new Date();

				return this.transaction(async () => {
					await this.update(id, { deletedAt: now });

					await this.sectionRepository.updateMany(
						{ courseId: id },
						{ deletedAt: now },
					);
					await this.lessonRepository.updateMany(
						{ section: { courseId: id } },
						{ deletedAt: now },
					);
					await this.quizRepository.updateMany(
						{ lesson: { section: { courseId: id } } },
						{ deletedAt: now },
					);

					return true;
				});
			}

			await this.delete(id);

			return true;
		} catch (error) {
			return this.handleError(error, `delete course with ID ${id}`, {
				id,
				softDelete,
			});
		}
	}

	async getOwnCourses(userId: string) {
		try {
			this.logger?.info("Get own courses", { userId });

			return await this.findMany({
				where: {
					instructorId: userId,
					deletedAt: null,
				},
				select: {
					id: true,
					title: true,
					status: true,
					updatedAt: true,
					thumbnailUrl: true,
				},
				orderBy: {
					createdAt: "desc",
				},
			});
		} catch (error) {
			return this.handleError(error, `Get own course with user id ${userId}`, {
				userId,
			});
		}
	}

	async searchOwnCourses(
		params: GetOwnCoursesInput & { instructorId: string },
	): Promise<Paginated<OwnCourseRepoRow>> {
		const {
			instructorId,
			q,
			status = "all",
			category,
			sort = "updated",
			page = 1,
		} = params;

		const where: Prisma.CourseWhereInput = {
			instructorId,
			deletedAt: null,
			...(status !== "all" ? { status } : {}),
			...(category
				? { category: { equals: category, mode: "insensitive" } }
				: {}),
			...(q
				? {
						OR: [
							{ title: { contains: q, mode: "insensitive" } },
							{ subtitle: { contains: q, mode: "insensitive" } },
							{ description: { contains: q, mode: "insensitive" } },
						],
					}
				: {}),
		};

		const ORDER_BY: Record<
			GetOwnCoursesInput["sort"],
			Prisma.CourseOrderByWithRelationInput
		> = {
			updated: { updatedAt: "desc" },
			newest: { createdAt: "desc" },
			oldest: { createdAt: "asc" },
			title: { title: "asc" },
			students: { enrollments: { _count: "desc" } },
		};

		const [rows, total] = await Promise.all([
			this.findMany({
				where,
				select: {
					id: true,
					title: true,
					status: true,
					updatedAt: true,
					thumbnailUrl: true,
					_count: {
						select: {
							enrollments: {
								where: {
									status: {
										in: [EnrollmentStatus.active, EnrollmentStatus.completed],
									},
								},
							},
						},
					},
				},
				orderBy: ORDER_BY[sort],
				skip: (page - 1) * COURSE_PAGE_SIZE,
				take: COURSE_PAGE_SIZE,
			}),
			this.count(where),
		]);

		const data: OwnCourseRepoRow[] = rows.map((c) => ({
			id: c.id,
			title: c.title,
			status: c.status,
			updatedAt: c.updatedAt,
			thumbnailUrl: c.thumbnailUrl,
			students: c._count.enrollments,
		}));

		return {
			data,
			total,
			currentPage: page,
			lastPage: Math.max(1, Math.ceil(total / COURSE_PAGE_SIZE)),
			perPage: COURSE_PAGE_SIZE,
		};
	}

	async getOwnCourse(courseId: string, instructorId: string) {
		return await this.findFirst({
			where: { id: courseId, instructorId: instructorId },
			include: {
				sections: {
					orderBy: { order: "asc" },
					include: {
						lessons: {
							orderBy: { order: "asc" },
						},
					},
				},
			},
		});
	}

	async getCoursesStats(instructorId: string) {
		try {
			this.logger?.info("Getting course stats", { instructorId });

			const now = new Date();

			const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
			const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

			const mainStats = await this.transaction(async () => {
				const draft = await this.count({
					status: CourseStatus.draft,
					instructorId,
					deletedAt: null,
				});

				const published = await this.count({
					status: CourseStatus.published,
					instructorId,
					deletedAt: null,
				});

				const lastCourses = await this.count({
					createdAt: {
						gte: startOfMonth,
						lte: endOfMonth,
					},
					instructorId,
					deletedAt: null,
				});

				return {
					draft,
					published,
					lastCourses,
				};
			});

			return {
				...mainStats,
				total: mainStats.draft + mainStats.published,
			};
		} catch (error) {
			return this.handleError(
				error,
				`Get courses stats with instructor id ${instructorId}`,
				{
					instructorId,
				},
			);
		}
	}

	async getPublishedCourses(params?: {
		q?: string;
		category?: string;
		page?: number;
	}) {
		const { q, category, page = 1 } = params ?? {};

		const where: Prisma.CourseWhereInput = {
			status: "published",
			deletedAt: null,
			...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
			...(category ? { category } : {}),
		};

		const include = {
			instructor: { select: { name: true } },
			_count: { select: { enrollments: true } },
		};

		const [courses, total] = await Promise.all([
			this.findMany({
				where,
				include,
				skip: (page - 1) * COURSE_PAGE_SIZE,
				take: COURSE_PAGE_SIZE,
				orderBy: { createdAt: "desc" },
			}),
			this.count(where),
		]);

		const ratings = await this.courseReviewRepository.getAvgRatingByCourseIds(
			courses.map((course) => course.id),
		);

		return {
			courses: courses.map((course) => {
				const avg = ratings.get(course.id);
				return {
					id: course.id,
					title: course.title,
					instructor: course.instructor.name,
					rating: avg == null ? null : Number(avg.toFixed(1)),
					students: course._count.enrollments,
					duration: course.duration,
					priceCents: course.priceCents,
					level: course.level,
					thumbnail: course.thumbnailUrl,
					category: course.category,
				};
			}),
			total,
		};
	}

	async getPublishedCourse(courseId: string) {
		return await this.findFirst({
			where: {
				id: courseId,
				status: "published",
				deletedAt: null,
			},
			include: {
				instructor: {
					select: {
						name: true,
						image: true,
					},
				},
				sections: {
					where: { deletedAt: null },
					orderBy: { order: "asc" },
					include: {
						lessons: {
							where: { deletedAt: null },
							orderBy: { order: "asc" },
							select: {
								id: true,
								title: true,
								durationMinutes: true,
							},
						},
					},
				},
				reviews: {
					where: { deletedAt: null },
					orderBy: { createdAt: "desc" },
					include: {
						student: {
							select: {
								name: true,
								image: true,
							},
						},
					},
				},
				_count: {
					select: {
						enrollments: true,
					},
				},
			},
		});
	}

	async getInstructorStats(instructorId: string) {
		const [coursesCount, studentsCount, instructorRatingResult] =
			await Promise.all([
				this.count({ instructorId }),
				this.enrollmentRepository.count({
					course: {
						instructorId,
						deletedAt: null,
					},
				}),
				this.courseReviewRepository.aggregate({
					where: {
						deletedAt: null,
						course: {
							instructorId,
							deletedAt: null,
						},
					},
					_avg: {
						rating: true,
					},
				}),
			]);

		return {
			coursesCount,
			studentsCount,
			instructorRating: instructorRatingResult._avg.rating,
		};
	}

	async getCourseCardsByIds(
		instructorId: string,
		courseIds: string[],
	): Promise<Map<string, { title: string; students: number }>> {
		if (courseIds.length === 0) return new Map();
		const courses = await this.findMany({
			where: { id: { in: courseIds }, instructorId, deletedAt: null },
			select: {
				id: true,
				title: true,
				_count: {
					select: {
						enrollments: {
							where: {
								status: {
									in: [EnrollmentStatus.active, EnrollmentStatus.completed],
								},
							},
						},
					},
				},
			},
		});
		return new Map(
			courses.map((c) => [
				c.id,
				{ title: c.title, students: c._count.enrollments },
			]),
		);
	}

	async findManyByIdsPreservingOrder(ids: string[]) {
		if (ids.length === 0) return [];
		const courses = await this.findMany({
			where: {
				id: { in: ids },
				status: CourseStatus.published,
				deletedAt: null,
			},
			include: {
				instructor: { select: { name: true } },
				_count: { select: { enrollments: true } },
			},
		});
		const ratings = await this.courseReviewRepository.getAvgRatingByCourseIds(
			courses.map((course) => course.id),
		);
		const map = new Map(courses.map((c) => [c.id, c]));
		return ids
			.map((id) => map.get(id))
			.filter((c): c is NonNullable<typeof c> => c != null)
			.map((course) => {
				const avg = ratings.get(course.id);
				return {
					id: course.id,
					title: course.title,
					instructor: course.instructor.name,
					rating: avg == null ? null : Number(avg.toFixed(1)),
					students: course._count.enrollments,
					duration: course.duration,
					priceCents: course.priceCents,
					level: course.level,
					thumbnail: course.thumbnailUrl,
					category: course.category,
				};
			});
	}
}

export const courseRepository = new CourseRepository();
