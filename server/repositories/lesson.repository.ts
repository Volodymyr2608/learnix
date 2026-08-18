import type { Lesson, Prisma } from "@/generated/prisma";
import type { LessonOrderRow } from "@/server/services/learningPathAI/learningPathAI.state";
import { BaseRepository } from "./base/base.repository";
import { parseStoredConceptsPerElement } from "./lessonInsights.conceptsSchema";

class LessonRepository extends BaseRepository<
	"lesson",
	Lesson,
	Prisma.LessonUncheckedCreateInput,
	Prisma.LessonUpdateInput,
	Prisma.LessonWhereInput,
	Prisma.LessonInclude,
	Prisma.LessonSelect,
	Prisma.LessonOrderByWithRelationInput
> {
	protected readonly modelName = "lesson" as const;

	async listOrderedWithConcepts(courseId: string): Promise<LessonOrderRow[]> {
		const sections = await this.db.section.findMany({
			where: { courseId, deletedAt: null },
			orderBy: { order: "asc" },
			include: {
				lessons: {
					where: { deletedAt: null },
					orderBy: { order: "asc" },
					include: { lessonInsights: { select: { concepts: true } } },
				},
			},
		});
		return sections.flatMap((s) =>
			s.lessons.map((l) => ({
				id: l.id,
				title: l.title,
				sectionOrder: s.order,
				lessonOrder: l.order,
				// Per element: one malformed entry drops itself rather than the
				// lesson's whole list, and `[{ notName: 1 }]` yields [] rather than
				// [undefined] into the learning-path graph.
				concepts: parseStoredConceptsPerElement(l.lessonInsights?.concepts, {
					lessonId: l.id,
				}).map((c) => c.name),
			})),
		);
	}

	async findOrderedLessonIdsByCourseIds(
		courseIds: string[],
	): Promise<{ courseId: string; lessonId: string; title: string }[]> {
		if (courseIds.length === 0) return [];
		const sections = await this.db.section.findMany({
			where: { courseId: { in: courseIds }, deletedAt: null },
			orderBy: { order: "asc" },
			select: {
				courseId: true,
				lessons: {
					where: { deletedAt: null },
					orderBy: { order: "asc" },
					select: { id: true, title: true },
				},
			},
		});
		return sections.flatMap((s) =>
			s.lessons.map((l) => ({
				courseId: s.courseId,
				lessonId: l.id,
				title: l.title,
			})),
		);
	}

	async completedLessonIds(
		courseId: string,
		studentId: string,
	): Promise<string[]> {
		const rows = await this.db.lessonProgress.findMany({
			where: {
				studentId,
				isCompleted: true,
				lesson: { section: { courseId } },
			},
			select: { lessonId: true },
		});
		return rows.map((r) => r.lessonId);
	}
}

export const lessonRepository = new LessonRepository();
