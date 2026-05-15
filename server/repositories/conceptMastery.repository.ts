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
		return this.upsert({
			where: { studentId_courseId_concept: { studentId, courseId, concept } },
			create: { studentId, courseId, concept, level },
			update: { level },
		});
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
