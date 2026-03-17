import type { CourseGenerationMessage, Prisma } from "@/generated/prisma";
import { BaseRepository } from "@/server/repositories/base/base.repository";

export default class CourseGenerationMessageRepository extends BaseRepository<
	"courseGenerationMessage",
	CourseGenerationMessage,
	Prisma.CourseGenerationMessageCreateInput,
	Prisma.CourseGenerationMessageUpdateInput,
	Prisma.CourseGenerationMessageWhereInput,
	Prisma.CourseGenerationMessageInclude,
	Prisma.CourseGenerationMessageSelect,
	Prisma.CourseGenerationMessageOrderByWithRelationInput
> {
	protected readonly modelName = "courseGenerationMessage";
}

export const courseGenerationMessageRepository =
	new CourseGenerationMessageRepository();
