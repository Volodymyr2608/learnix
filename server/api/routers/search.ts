import { z } from "zod";
import { recommendationsService } from "@/server/services/search/recommendations.service";
import { searchService } from "@/server/services/search/search.service";
import { handleServiceError } from "@/server/utils/handleServiceError";
import { createTRPCRouter, studentProcedure } from "../trpc";

export const searchRouter = createTRPCRouter({
	semantic: studentProcedure
		.input(
			z.object({
				query: z.string().min(1),
				category: z.string().optional(),
				level: z.string().optional(),
				limit: z.number().int().min(1).max(50).optional(),
			}),
		)
		.query(async ({ input }) => {
			try {
				return await searchService.semantic({
					query: input.query,
					filters: {
						category: input.category,
						level: input.level,
					},
					limit: input.limit,
				});
			} catch (error) {
				handleServiceError(error);
			}
		}),

	recommendations: studentProcedure.query(async ({ ctx }) => {
		try {
			return await recommendationsService.forUser(ctx.session.user.id);
		} catch (error) {
			handleServiceError(error);
		}
	}),
});
