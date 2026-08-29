import { randomUUID } from "node:crypto";
import type {
	ConceptMastery,
	MasteryEvidence,
	Prisma,
} from "@/generated/prisma";
import { conceptKey } from "@/server/services/_shared/concepts/conceptKey";
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
		evidence: MasteryEvidence,
	): Promise<ConceptMastery> {
		// Monotonic by construction: a later, lower write cannot undo an earlier,
		// higher one. The level-3-by-quiz rule depends on this and nothing else
		// enforces it. GREATEST has no Prisma query-builder equivalent.
		//
		// Provenance follows the level, on the same condition: the evidence must
		// describe the level the row actually holds, so a level-2 write over a
		// level-3 row leaves both alone — including a NULL, which says the row
		// predates the column and must not be given a story it did not earn.
		// The conflict target is the KEY, not the spelling: two callers that
		// disagree about case or whitespace are talking about one concept, and the
		// old target let the second of them insert a second row. The stored
		// spelling stays whichever one arrived first — presentation, not identity.
		const id = randomUUID();
		const key = conceptKey(concept);
		const rows = await this.db.$queryRaw<ConceptMastery[]>`
			INSERT INTO concept_mastery (id, "studentId", "courseId", concept, "conceptKey", level, evidence, "updatedAt")
			VALUES (${id}, ${studentId}, ${courseId}, ${concept}, ${key}, ${level}, ${evidence}::"MasteryEvidence", NOW())
			ON CONFLICT ("studentId", "courseId", "conceptKey")
			DO UPDATE SET
				level = GREATEST(concept_mastery.level, EXCLUDED.level),
				evidence = CASE
					WHEN EXCLUDED.level > concept_mastery.level THEN EXCLUDED.evidence
					-- A row whose provenance was never knowable, re-earned at the level it
					-- already holds: it is now known, and leaving it LEGACY would keep
					-- counting it in the unattributed population it has just left. This
					-- read IS NULL until the evidence column became NOT NULL; LEGACY is
					-- what those rows were backfilled to and is the same population under
					-- a name. Never overwrites evidence that already says something.
					WHEN concept_mastery.evidence = 'LEGACY' AND EXCLUDED.level = concept_mastery.level
						THEN EXCLUDED.evidence
					ELSE concept_mastery.evidence
				END,
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
