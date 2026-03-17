import type { Lesson, Prisma } from "@/generated/prisma";
import { BaseRepository } from "@/server/repositories/base/base.repository";

export default class LessonRepository extends BaseRepository<
	"lesson",
	Lesson,
	Prisma.LessonCreateInput,
	Prisma.LessonUpdateInput,
	Prisma.LessonWhereInput,
	Prisma.LessonInclude,
	Prisma.LessonSelect,
	Prisma.LessonOrderByWithRelationInput
> {
	protected readonly modelName = "lesson";
}

export const lessonRepository = new LessonRepository();
