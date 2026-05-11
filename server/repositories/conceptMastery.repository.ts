import type { ConceptMastery, Prisma } from "@/generated/prisma";
import { BaseRepository } from "@/server/repositories/base/base.repository";

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
		return this.upsert({
			where: { studentId_courseId_concept: { studentId, courseId, concept } },
			create: { studentId, courseId, concept, level },
			update: { level },
		});
	}
}

export const conceptMasteryRepository = new ConceptMasteryRepository();
