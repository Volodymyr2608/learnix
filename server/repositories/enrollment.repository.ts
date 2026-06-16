import type { Enrollment, Prisma } from "@/generated/prisma";
import { EnrollmentStatus } from "@/generated/prisma";
import { getMonthWindows } from "@/lib/stats/monthWindows";
import { BaseRepository } from "./base/base.repository";

class EnrollmentRepository extends BaseRepository<
	"enrollment",
	Enrollment,
	Prisma.EnrollmentUncheckedCreateInput,
	Prisma.EnrollmentUpdateInput,
	Prisma.EnrollmentWhereInput,
	Prisma.EnrollmentInclude,
	Prisma.EnrollmentSelect,
	Prisma.EnrollmentOrderByWithRelationInput
> {
	protected readonly modelName = "enrollment" as const;

	async findEnrolledCourseIds(userId: string): Promise<string[]> {
		const rows = await this.findMany({
			where: {
				studentId: userId,
				status: { in: [EnrollmentStatus.active, EnrollmentStatus.completed] },
			},
			select: { courseId: true },
		});
		return rows.map((r) => (r as { courseId: string }).courseId);
	}

	findByIdWithRelations(enrollmentId: string) {
		return this.findFirst({
			where: { id: enrollmentId },
			include: {
				student: {
					select: {
						id: true,
						email: true,
						name: true,
						emailNotificationsEnabled: true,
					},
				},
				course: {
					include: {
						instructor: { select: { name: true } },
					},
				},
			},
		});
	}

	findActiveWithLessons() {
		return this.findMany({
			where: {
				status: { in: [EnrollmentStatus.active, EnrollmentStatus.completed] },
				course: { deletedAt: null, status: "published" },
			},
			include: {
				student: {
					select: {
						id: true,
						email: true,
						name: true,
						emailNotificationsEnabled: true,
					},
				},
				course: {
					include: {
						sections: {
							where: { deletedAt: null },
							orderBy: { order: "asc" },
							include: {
								lessons: {
									where: { deletedAt: null },
									orderBy: { order: "asc" },
									select: { id: true, title: true },
								},
							},
						},
					},
				},
			},
		});
	}

	findByStudentCourseWithRelations(studentId: string, courseId: string) {
		return this.findFirst({
			where: { studentId, courseId },
			include: {
				student: {
					select: {
						email: true,
						name: true,
						emailNotificationsEnabled: true,
					},
				},
				course: { select: { id: true, title: true } },
			},
		});
	}

	findByStudentCourse(studentId: string, courseId: string) {
		return this.findFirst({
			where: {
				studentId,
				courseId,
				status: { not: EnrollmentStatus.cancelled },
			},
			include: { course: { select: { deletedAt: true, status: true } } },
		});
	}

	async findRecentByInstructor(
		instructorId: string,
		take: number,
	): Promise<
		{
			id: string;
			studentName: string;
			courseTitle: string;
			enrolledAt: Date;
		}[]
	> {
		const rows = await this.findMany({
			where: {
				status: EnrollmentStatus.active,
				course: { is: { instructorId, deletedAt: null } },
			},
			orderBy: { enrolledAt: "desc" },
			take,
			select: {
				id: true,
				enrolledAt: true,
				student: { select: { name: true } },
				course: { select: { title: true } },
			},
		});
		return rows.map((r) => ({
			id: r.id,
			studentName: r.student.name,
			courseTitle: r.course.title,
			enrolledAt: r.enrolledAt,
		}));
	}

	async getInstructorStudentStats(instructorId: string): Promise<{
		total: number;
		thisMonthNew: number;
		lastMonthNew: number;
	}> {
		const { startThisMonth, startLastMonth, startNextMonth } =
			getMonthWindows();
		const ownedActive = {
			status: EnrollmentStatus.active,
			course: { is: { instructorId, deletedAt: null } },
		};

		const [totalResult, thisMonthNew, lastMonthNew] = await Promise.all([
			this.db.$queryRaw<[{ cnt: bigint }]>`
				SELECT COUNT(DISTINCT "studentId") AS cnt
				FROM enrollments
				WHERE status = 'active'
				  AND "courseId" IN (
					SELECT id FROM courses
					WHERE "instructorId" = ${instructorId}
					  AND deleted_at IS NULL
				  )
			`,
			this.count({
				...ownedActive,
				enrolledAt: { gte: startThisMonth, lt: startNextMonth },
			}),
			this.count({
				...ownedActive,
				enrolledAt: { gte: startLastMonth, lt: startThisMonth },
			}),
		]);

		return {
			total: Number(totalResult[0]?.cnt ?? 0),
			thisMonthNew,
			lastMonthNew,
		};
	}
}

export const enrollmentRepository = new EnrollmentRepository();
