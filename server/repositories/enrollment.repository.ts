import type { Enrollment, Prisma } from "@/generated/prisma";
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
}

export const enrollmentRepository = new EnrollmentRepository();
