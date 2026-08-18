import type { LessonInsights, Prisma } from "@/generated/prisma";
import { BaseRepository } from "@/server/repositories/base/base.repository";
import {
	parseStoredConcepts,
	type StoredConcept,
} from "./lessonInsights.conceptsSchema";

/**
 * The row as consumers see it: `concepts` is a parsed array, not raw JSON. The
 * type is the boundary — a consumer cannot go back to calling `.map` on
 * whatever the column happened to hold.
 */
export type LessonInsightsRow = Omit<LessonInsights, "concepts"> & {
	concepts: StoredConcept[];
};

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

	/**
	 * Reads the row and parses `concepts` at the boundary, so no consumer has to.
	 * A malformed value becomes `[]` plus one telemetry event rather than a
	 * TypeError three call sites away.
	 */
	async findByLessonId(lessonId: string): Promise<LessonInsightsRow | null> {
		const row = await this.db.lessonInsights.findUnique({
			where: { lessonId },
		});
		if (!row) return null;

		return {
			...row,
			concepts: parseStoredConcepts(row.concepts, { lessonId }),
		};
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
		return this.upsert({
			where: { lessonId },
			create: { lessonId, ...data },
			update: { ...data, generatedAt: new Date() },
		});
	}
}

export const lessonInsightsRepository = new LessonInsightsRepository();
