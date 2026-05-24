import { LessonInsightsSchema } from "@/prisma/zod";
import {
	createTRPCRouter,
	instructorProcedure,
	protectedProcedure,
} from "@/server/api/trpc";
import { lessonInsightsAIService } from "@/server/services/lessonInsightsAI/lessonInsightsAI.service";
import { handleServiceError } from "@/server/utils/handleServiceError";

export const lessonInsightsAIRouter = createTRPCRouter({
	generateLessonInsights: instructorProcedure
		.input(LessonInsightsSchema.shape.lessonId)
		.mutation(async ({ ctx, input }) => {
			try {
				return await lessonInsightsAIService.generateForLesson(
					input,
					ctx.session.user.id,
				);
			} catch (error) {
				handleServiceError(error);
			}
		}),

	getLessonInsights: protectedProcedure
		.input(LessonInsightsSchema.shape.lessonId)
		.query(async ({ ctx, input }) => {
			try {
				return await lessonInsightsAIService.getForLesson(
					input,
					ctx.session.user.id,
				);
			} catch (error) {
				handleServiceError(error);
			}
		}),
});
