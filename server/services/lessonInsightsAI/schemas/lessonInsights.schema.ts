import { z } from "zod";

export const SummarySchema = z.object({
	summary: z.string().min(40).max(800),
});

export const ConceptsSchema = z.object({
	concepts: z
		.array(
			z.object({
				name: z.string().min(1).max(80),
				explanation: z.string().min(10).max(300),
			}),
		)
		.min(3)
		.max(7),
});

export const GlossarySchema = z.object({
	glossary: z
		.array(
			z.object({
				term: z.string().min(1).max(60),
				definition: z.string().min(10).max(300),
			}),
		)
		.min(0)
		.max(15),
});

export type SummaryOutput = z.infer<typeof SummarySchema>;
export type ConceptsOutput = z.infer<typeof ConceptsSchema>;
export type GlossaryOutput = z.infer<typeof GlossarySchema>;
export type Concept = ConceptsOutput["concepts"][number];
export type GlossaryItem = GlossaryOutput["glossary"][number];
