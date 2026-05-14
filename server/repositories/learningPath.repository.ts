import type { LearningPathCache, Prisma } from "@/generated/prisma";
import { BaseRepository } from "./base/base.repository";
import type { PathStep } from "@/server/services/learningPathAI/schemas/learningPath.schema";

class LearningPathRepository extends BaseRepository<
	"learningPathCache",
	LearningPathCache,
	Prisma.LearningPathCacheUncheckedCreateInput,
	Prisma.LearningPathCacheUpdateInput,
	Prisma.LearningPathCacheWhereInput,
	Prisma.LearningPathCacheInclude,
	Prisma.LearningPathCacheSelect,
	Prisma.LearningPathCacheOrderByWithRelationInput
> {
	protected readonly modelName = "learningPathCache" as const;

	findByStudentCourse(studentId: string, courseId: string) {
		return this.db.learningPathCache.findUnique({
			where: { studentId_courseId: { studentId, courseId } },
		});
	}

	upsertPath(input: {
		studentId: string;
		courseId: string;
		steps: PathStep[];
		summary: string;
		weakConcepts: string[];
		model: string;
	}) {
		const { studentId, courseId, steps, weakConcepts, summary, model } = input;
		const jsonSteps = steps as Prisma.InputJsonValue;
		const jsonWeakConcepts = weakConcepts as Prisma.InputJsonValue;
		return this.upsert({
			where: { studentId_courseId: { studentId, courseId } },
			create: {
				studentId,
				courseId,
				steps: jsonSteps,
				weakConcepts: jsonWeakConcepts,
				summary,
				model,
				staleAt: null,
			},
			update: {
				steps: jsonSteps,
				weakConcepts: jsonWeakConcepts,
				summary,
				model,
				generatedAt: new Date(),
				staleAt: null,
			},
		});
	}

	markStale(studentId: string, courseId: string) {
		return this.db.learningPathCache.updateMany({
			where: { studentId, courseId, staleAt: null },
			data: { staleAt: new Date() },
		});
	}
}

export const learningPathRepository = new LearningPathRepository();
