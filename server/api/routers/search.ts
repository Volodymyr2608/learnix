import { SemanticSearchDto } from "@/server/entities/search";
import { recommendationsService } from "@/server/services/search/recommendations.service";
import { searchService } from "@/server/services/search/search.service";
import { handleServiceError } from "@/server/utils/handleServiceError";
import { createTRPCRouter, studentProcedure } from "../trpc";

export const searchRouter = createTRPCRouter({
	semantic: studentProcedure
		.input(SemanticSearchDto)
		.query(async ({ input }) => {
			try {
				return await searchService.semantic(input);
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
