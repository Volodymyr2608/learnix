import type { LessonInsights, Prisma } from "@/generated/prisma";
import { BaseRepository } from "@/server/repositories/base/base.repository";

class LessonInsightsRepository extends BaseRepository<
	"lessonInsights",
	LessonInsights,
	Prisma.LessonInsightsUncheckedCreateInput,
	Prisma.LessonInsightsUpdateInput,
	Prisma.LessonInsightsWhereInput,
	Prisma.LessonInsightsInclude,
	Prisma.LessonInsightsSelect,
	Prisma.LessonInsightsOrderByWithRelationInput
> {
	protected readonly modelName = "lessonInsights" as const;

	async findByLessonId(lessonId: string): Promise<LessonInsights | null> {
		return this.db.lessonInsights.findUnique({ where: { lessonId } });
	}

	async upsertByLessonId(
		lessonId: string,
		data: {
			summary: string;
			concepts: Prisma.InputJsonValue;
			glossary: Prisma.InputJsonValue;
			model: string;
			contentHash: string;
		},
	): Promise<LessonInsights> {
		return this.db.lessonInsights.upsert({
			where: { lessonId },
			create: { lessonId, ...data },
			update: { ...data, generatedAt: new Date() },
		});
	}
}

export const lessonInsightsRepository = new LessonInsightsRepository();
