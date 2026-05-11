import { db } from "@/server/db";

class ConceptMasteryRepository {
	async upsert(
		studentId: string,
		courseId: string,
		concept: string,
		level: number,
	) {
		return db.conceptMastery.upsert({
			where: { studentId_courseId_concept: { studentId, courseId, concept } },
			create: { studentId, courseId, concept, level },
			update: { level },
		});
	}

	async getForStudent(studentId: string, courseId: string) {
		return db.conceptMastery.findMany({
			where: { studentId, courseId },
			orderBy: { concept: "asc" },
		});
	}
}

export const conceptMasteryRepository = new ConceptMasteryRepository();
