import type { Enrollment, Prisma } from "@/generated/prisma";
import { EnrollmentStatus } from "@/generated/prisma";
import { getMonthWindows } from "@/lib/stats/monthWindows";
import { db } from "@/server/db";
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
		} as const;

		const [distinctGroups, thisMonthNew, lastMonthNew] = await Promise.all([
			db.enrollment.groupBy({
				by: ["studentId"],
				where: ownedActive,
			}),
			this.count({
				...ownedActive,
				enrolledAt: { gte: startThisMonth, lt: startNextMonth },
			}),
			this.count({
				...ownedActive,
				enrolledAt: { gte: startLastMonth, lt: startThisMonth },
			}),
		]);

		return { total: distinctGroups.length, thisMonthNew, lastMonthNew };
	}
}

export const enrollmentRepository = new EnrollmentRepository();
