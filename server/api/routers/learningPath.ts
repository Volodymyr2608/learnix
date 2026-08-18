import { LearningPathCourseDto } from "@/server/entities/learningPath";
import { learningPathAIService } from "@/server/services/learningPathAI/learningPathAI.service";
import { handleServiceError } from "@/server/utils/handleServiceError";
import { createTRPCRouter, studentProcedure } from "../trpc";

export const learningPathRouter = createTRPCRouter({
	getForCourse: studentProcedure
		.input(LearningPathCourseDto)
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
		.input(LearningPathCourseDto)
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
