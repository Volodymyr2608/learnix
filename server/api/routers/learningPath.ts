import { z } from "zod";
import { learningPathAIService } from "@/server/services/learningPathAI/learningPathAI.service";
import { handleServiceError } from "@/server/utils/handleServiceError";
import { createTRPCRouter, studentProcedure } from "../trpc";

export const learningPathRouter = createTRPCRouter({
	getForCourse: studentProcedure
		.input(z.object({ courseId: z.string().min(1) }))
		.query(async ({ ctx, input }) => {
			try {
				return await learningPathAIService.getForCourse(
					ctx.session.user.id,
					input.courseId,
				);
			} catch (error) {
				handleServiceError(error);
			}
		}),

	regenerate: studentProcedure
		.input(z.object({ courseId: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			try {
				return await learningPathAIService.regenerate(
					ctx.session.user.id,
					input.courseId,
				);
			} catch (error) {
				handleServiceError(error);
			}
		}),
});
