import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { MasteryEvidence } from "@/generated/prisma";
import { conceptMasteryRepository } from "@/server/repositories/conceptMastery.repository";
import { authorizeMarkConceptUnderstood } from "../toolPolicy";

export const buildMarkConceptUnderstoodTool = (
	studentId: string,
	courseId: string,
	lessonConcepts: string[],
) =>
	tool(
		async ({ concept, level }: { concept: string; level: number }) => {
			// Authority check before the side effect. A refusal returns as an
			// ordinary tool result so the agent loop can recover and keep helping
			// the student — it must not throw.
			const authorization = authorizeMarkConceptUnderstood(
				{ concept, level },
				{ userId: studentId, lessonConcepts },
			);
			// The artifact is what telemetry reads; the prose is for the model and
			// must never be load-bearing. mastery_write_retained has a baseline of
			// zero, so a signal that dies when a shared refusal string is reworded
			// is a permanent blind spot rather than a degraded metric.
			if (!authorization.authorized) {
				return [authorization.message, { committed: false }] as const;
			}

			await conceptMasteryRepository.upsertMastery(
				studentId,
				courseId,
				authorization.canonicalConcept,
				level,
				MasteryEvidence.CONVERSATION,
			);
			const labels = ["unfamiliar", "exposed", "applied", "mastered"];
			return [
				`Recorded: "${authorization.canonicalConcept}" at level ${level} (${labels[level] ?? level}).`,
				{ committed: true, concept: authorization.canonicalConcept, level },
			] as const;
		},
		{
			name: "mark_concept_understood",
			responseFormat: "content_and_artifact",
			description:
				"Records that the student has demonstrated understanding of a concept. Levels: 0 = unfamiliar, 1 = exposed, 2 = applied. Level 3 (mastered) is earned by completing the lesson's quizzes and cannot be set from conversation. Use sparingly — only when the student explicitly demonstrates understanding.",
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
					.describe("Mastery level: 0 unfamiliar, 1 exposed, 2 applied"),
			}),
		},
	);
