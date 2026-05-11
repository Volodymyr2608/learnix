import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { conceptMasteryRepository } from "@/server/repositories/conceptMastery.repository";

export const buildMarkConceptUnderstoodTool = (
	studentId: string,
	courseId: string,
) =>
	tool(
		async ({ concept, level }: { concept: string; level: number }) => {
			await conceptMasteryRepository.upsertMastery(
				studentId,
				courseId,
				concept,
				level,
			);
			const labels = ["unfamiliar", "exposed", "applied", "mastered"];
			return `Recorded: "${concept}" at level ${level} (${labels[level] ?? level}).`;
		},
		{
			name: "mark_concept_understood",
			description:
				"Records that the student has demonstrated understanding of a concept. Levels: 0 = unfamiliar, 1 = exposed, 2 = applied, 3 = mastered. Use sparingly — only when the student explicitly demonstrates understanding.",
			schema: z.object({
				concept: z
					.string()
					.min(1)
					.max(80)
					.describe("The concept the student demonstrated understanding of"),
				level: z
					.number()
					.int()
					.min(0)
					.max(3)
					.describe(
						"Mastery level: 0 unfamiliar, 1 exposed, 2 applied, 3 mastered",
					),
			}),
		},
	);
