import type { InstructorProfile, Prisma } from "@/generated/prisma";
import { BaseRepository } from "@/server/repositories/base/base.repository";

export default class InstructorRepository extends BaseRepository<
	"instructorProfile",
	InstructorProfile,
	Prisma.InstructorProfileUncheckedCreateInput,
	Prisma.InstructorProfileUpdateInput,
	Prisma.InstructorProfileWhereInput,
	Prisma.InstructorProfileInclude,
	Prisma.InstructorProfileSelect,
	Prisma.InstructorProfileOrderByWithRelationInput
> {
	protected readonly modelName = "instructorProfile" as const;
}

export const instructorRepository = new InstructorRepository();
