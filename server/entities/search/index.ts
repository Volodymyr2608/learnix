import { z } from "zod";

export const SemanticSearchDto = z.object({
	query: z.string().min(1),
	category: z.string().optional(),
	level: z.string().optional(),
	limit: z.number().int().min(1).max(50).optional(),
});
export type SemanticSearchDto = z.infer<typeof SemanticSearchDto>;
