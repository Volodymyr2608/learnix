import { LessonInsightsSchema } from "@/prisma/zod";
import {
	createTRPCRouter,
	instructorProcedure,
	protectedProcedure,
} from "@/server/api/trpc";
import { aiRateLimit } from "@/server/services/_shared/aiLimits/aiRateLimit.middleware";
import { lessonInsightsAIService } from "@/server/services/lessonInsightsAI/lessonInsightsAI.service";
import { handleServiceError } from "@/server/utils/handleServiceError";

export const lessonInsightsAIRouter = createTRPCRouter({
	generateLessonInsights: instructorProcedure
		.use(aiRateLimit("lessonInsightsAI"))
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
