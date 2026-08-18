import { TRPCError } from "@trpc/server";
import { LearningPathCourseDto } from "@/server/entities/learningPath";
import { enrollmentRepository } from "@/server/repositories/enrollment.repository";
import { aiRateLimit } from "@/server/services/_shared/aiLimits/aiRateLimit.middleware";
import { learningPathAIService } from "@/server/services/learningPathAI/learningPathAI.service";
import { handleServiceError } from "@/server/utils/handleServiceError";
import { createTRPCRouter, studentProcedure } from "../trpc";

export const learningPathRouter = createTRPCRouter({
	getForCourse: studentProcedure
		.input(LearningPathCourseDto)
		.query(async ({ ctx, input }) => {
			try {
				// Reads are scoped by studentId in the repository, so a stranger's
				// courseId returns nothing rather than someone else's path.
				return await learningPathAIService.getForCourse(
					ctx.session.user.id,
					input.courseId,
				);
			} catch (error) {
				handleServiceError(error);
			}
		}),

	regenerate: studentProcedure
		.use(aiRateLimit("learningPathAI"))
		.input(LearningPathCourseDto)
		.mutation(async ({ ctx, input }) => {
			try {
				// The SSE twin has verified the enrollment since it shipped
				// (app/api/chat/learning-path/route.ts); this procedure did not, so any
				// authenticated student could obtain lesson titles and model-written
				// reasons for a course they are not enrolled in.
				const enrollment = await enrollmentRepository.findByStudentCourse(
					ctx.session.user.id,
					input.courseId,
				);
				if (!enrollment) throw new TRPCError({ code: "FORBIDDEN" });

				// enrollment.courseId, never input.courseId — the verified id is what
				// the service and the scoped limiter key both use.
				return await learningPathAIService.regenerate(
					ctx.session.user.id,
					enrollment.courseId,
				);
			} catch (error) {
				handleServiceError(error);
			}
		}),
});
