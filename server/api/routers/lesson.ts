import { LessonSchema } from "@/prisma/zod";
import { LessonContentUpdateDto } from "@/server/entities/lesson";
import { lessonService } from "@/server/services/lesson/lesson.service";
import { handleServiceError } from "@/server/utils/handleServiceError";
import { createTRPCRouter, instructorProcedure } from "../trpc";

export const lessonRouter = createTRPCRouter({
	getLesson: instructorProcedure
		.input(LessonSchema.shape.id)
		.query(async ({ ctx, input }) => {
			try {
				return await lessonService.getLesson(input, ctx.session.user.id);
			} catch (error) {
				handleServiceError(error);
			}
		}),

	updateContent: instructorProcedure
		.input(LessonContentUpdateDto)
		.mutation(async ({ ctx, input }) => {
			try {
				return await lessonService.updateLessonContent(
					input.id,
					input,
					ctx.session.user.id,
				);
			} catch (error) {
				handleServiceError(error);
			}
		}),
});
