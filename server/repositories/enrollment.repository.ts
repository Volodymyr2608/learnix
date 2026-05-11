import type { Enrollment, Prisma } from "@/generated/prisma";
import { EnrollmentStatus } from "@/generated/prisma";
import { BaseRepository } from "@/server/repositories/base/base.repository";

export default class EnrollmentRepository extends BaseRepository<
	"enrollment",
	Enrollment,
	Prisma.EnrollmentUncheckedCreateInput,
	Prisma.EnrollmentUpdateInput,
	Prisma.EnrollmentWhereInput,
	Prisma.EnrollmentInclude,
	Prisma.EnrollmentSelect,
	Prisma.EnrollmentOrderByWithRelationInput
> {
	protected readonly modelName = "enrollment";

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
}

export const enrollmentRepository = new EnrollmentRepository();
