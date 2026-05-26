import { DraftStep } from "@/generated/prisma";
import { z } from "zod";

// Relaxed schemas for withStructuredOutput — no min/max constraints to avoid
// schema-property leakage into LLM output. Full validation runs in validate.ts.
export const getExtractionSchemaForStep = (step: DraftStep) => {
	switch (step) {
		case DraftStep.basic:
			return z.object({
				title: z.string(),
				subtitle: z.string().optional(),
				description: z.string(),
				category: z.string(),
				level: z.string(),
				language: z.string(),
				duration: z.string(),
			});
		case DraftStep.objectives:
			return z.object({
				objectives: z.array(z.object({ value: z.string() })),
			});
		case DraftStep.requirements:
			return z.object({
				requirements: z.array(z.object({ value: z.string() })),
			});
		case DraftStep.curriculum:
			return z.object({
				sections: z.array(
					z.object({
						title: z.string(),
						order: z.number(),
						lessons: z.array(
							z.object({
								title: z.string(),
								duration: z.string().optional(),
							}),
						),
					}),
				),
			});
		default:
			throw new Error("Invalid step");
	}
};