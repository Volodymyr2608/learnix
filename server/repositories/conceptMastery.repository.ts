import { randomUUID } from "node:crypto";
import type { ConceptMastery, Prisma } from "@/generated/prisma";
import type { MasteryRow } from "@/server/services/learningPathAI/learningPathAI.state";
import { BaseRepository } from "./base/base.repository";

class ConceptMasteryRepository extends BaseRepository<
	"conceptMastery",
	ConceptMastery,
	Prisma.ConceptMasteryUncheckedCreateInput,
	Prisma.ConceptMasteryUpdateInput,
	Prisma.ConceptMasteryWhereInput,
	Prisma.ConceptMasteryInclude,
	Prisma.ConceptMasterySelect,
	Prisma.ConceptMasteryOrderByWithRelationInput
> {
	protected readonly modelName = "conceptMastery" as const;

	async upsertMastery(
		studentId: string,
		courseId: string,
		concept: string,
		level: number,
	): Promise<ConceptMastery> {
		// Monotonic by construction: a later, lower write cannot undo an earlier,
		// higher one. The level-3-by-quiz rule depends on this and nothing else
		// enforces it. GREATEST has no Prisma query-builder equivalent.
		const id = randomUUID();
		const rows = await this.db.$queryRaw<ConceptMastery[]>`
			INSERT INTO concept_mastery (id, "studentId", "courseId", concept, level, "updatedAt")
			VALUES (${id}, ${studentId}, ${courseId}, ${concept}, ${level}, NOW())
			ON CONFLICT ("studentId", "courseId", concept)
			DO UPDATE SET
				level = GREATEST(concept_mastery.level, EXCLUDED.level),
				"updatedAt" = CASE
					WHEN EXCLUDED.level > concept_mastery.level THEN NOW()
					ELSE concept_mastery."updatedAt"
				END
			RETURNING *;
		`;

		const row = rows[0];
		if (!row) throw new Error("upsertMastery returned no row");
		return row;
	}

	async byStudentCourse(
		studentId: string,
		courseId: string,
	): Promise<MasteryRow[]> {
		return this.findMany({
			where: { studentId, courseId },
			select: { concept: true, level: true },
		}) as unknown as MasteryRow[];
	}
}

export const conceptMasteryRepository = new ConceptMasteryRepository();
