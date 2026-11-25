import type { OpenedLesson, Prisma } from "@/generated/prisma";
import { BaseRepository } from "./base/base.repository";

class OpenedLessonRepository extends BaseRepository<
	"openedLesson",
	OpenedLesson,
	Prisma.OpenedLessonUncheckedCreateInput,
	Prisma.OpenedLessonUpdateInput,
	Prisma.OpenedLessonWhereInput,
	Prisma.OpenedLessonInclude,
	Prisma.OpenedLessonSelect,
	Prisma.OpenedLessonOrderByWithRelationInput
> {
	protected readonly modelName = "openedLesson" as const;

	/** FR-P19: idempotent — opening a lesson twice leaves one row. Errors propagate (fail closed). */
	async record(studentId: string, lessonId: string): Promise<void> {
		await this.db.openedLesson.createMany({
			data: [{ studentId, lessonId }],
			skipDuplicates: true,
		});
	}

	/**
	 * L and the opened count over the same set (Q13, EC-3): lessons of the course
	 * whose lesson and section are both not deleted (P3). Runs inside the caller's
	 * transaction so the counts are read under the refund lock.
	 */
	async countCourseLessons(
		tx: Prisma.TransactionClient,
		studentId: string,
		courseId: string,
	): Promise<{ lessonCount: number; openedCount: number }> {
		const liveLesson: Prisma.LessonWhereInput = {
			deletedAt: null,
			section: { courseId, deletedAt: null },
		};
		const [lessonCount, openedCount] = await Promise.all([
			tx.lesson.count({ where: liveLesson }),
			tx.openedLesson.count({ where: { studentId, lesson: liveLesson } }),
		]);
		return { lessonCount, openedCount };
	}
}

export const openedLessonRepository = new OpenedLessonRepository();
