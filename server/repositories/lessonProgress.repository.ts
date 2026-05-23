import type { LessonProgress, Prisma } from "@/generated/prisma";
import { BaseRepository } from "./base/base.repository";

class LessonProgressRepository extends BaseRepository<
	"lessonProgress",
	LessonProgress,
	Prisma.LessonProgressUncheckedCreateInput,
	Prisma.LessonProgressUpdateInput,
	Prisma.LessonProgressWhereInput,
	Prisma.LessonProgressInclude,
	Prisma.LessonProgressSelect,
	Prisma.LessonProgressOrderByWithRelationInput
> {
	protected readonly modelName = "lessonProgress" as const;

	findCompletedByLessonIds(studentId: string, lessonIds: string[]) {
		return this.findMany({
			where: {
				studentId,
				lessonId: { in: lessonIds },
				isCompleted: true,
			},
			orderBy: { updatedAt: "desc" },
			select: { lessonId: true, updatedAt: true },
		});
	}

	countCompleted(studentId: string, courseId: string) {
		return this.count({
			studentId,
			isCompleted: true,
			lesson: { section: { courseId }, deletedAt: null },
		} as Prisma.LessonProgressWhereInput);
	}

	async findCompletedIds(
		studentId: string,
		courseId: string,
	): Promise<string[]> {
		const rows = await this.findMany({
			where: {
				studentId,
				isCompleted: true,
				lesson: { section: { courseId } },
			},
			select: { lessonId: true },
		});
		return rows.map((r) => (r as { lessonId: string }).lessonId);
	}
}

export const lessonProgressRepository = new LessonProgressRepository();
