import { TRPCError } from "@trpc/server";
import { QuizSchema } from "@/prisma/zod";
import {
	QuizGenerateAIDto,
	QuizSubmitDto,
	QuizUpsertManyDto,
} from "@/server/entities/quiz";
import { aiRateLimit } from "@/server/services/_shared/aiLimits/aiRateLimit.middleware";
import { checkQuizSubmitRateLimit } from "@/server/services/_shared/aiLimits/checkQuizSubmitRateLimit";
import { quizService } from "@/server/services/quiz/quiz.service";
import { quizAIService } from "@/server/services/quizAI/quizAI.service";
import { handleServiceError } from "@/server/utils/handleServiceError";
import {
	createTRPCRouter,
	instructorProcedure,
	studentProcedure,
} from "../trpc";

export const quizRouter = createTRPCRouter({
	getByLesson: studentProcedure
		.input(QuizSchema.shape.lessonId)
		.query(async ({ ctx, input }) => {
			try {
				return await quizService.getByLesson(input, ctx.session.user.id);
			} catch (error) {
				handleServiceError(error);
			}
		}),

	submit: studentProcedure
		.input(QuizSubmitDto)
		.mutation(async ({ ctx, input }) => {
			// Outside the try: handleServiceError only knows domain errors, and this
			// is a transport-level refusal that must reach the client as written.
			// Not the `aiRateLimit` middleware — submitting a quiz is not a model
			// call, and it must not spend the student's tutor allowance.
			if (
				!(await checkQuizSubmitRateLimit(ctx.session.user.id, input.quizId))
			) {
				throw new TRPCError({
					code: "TOO_MANY_REQUESTS",
					message: "Too many submissions — please try again shortly.",
				});
			}

			try {
				return await quizService.submit(
					input.quizId,
					ctx.session.user.id,
					input.selectedAnswer,
				);
			} catch (error) {
				handleServiceError(error);
			}
		}),

	upsertMany: instructorProcedure
		.input(QuizUpsertManyDto)
		.mutation(async ({ ctx, input }) => {
			try {
				return await quizService.upsertMany(
					input.lessonId,
					input.questions,
					ctx.session.user.id,
				);
			} catch (error) {
				handleServiceError(error);
			}
		}),

	deleteByLesson: instructorProcedure
		.input(QuizSchema.shape.lessonId)
		.mutation(async ({ ctx, input }) => {
			try {
				return await quizService.deleteByLesson(input, ctx.session.user.id);
			} catch (error) {
				handleServiceError(error);
			}
		}),

	generateAI: instructorProcedure
		.use(aiRateLimit("quizAI"))
		.input(QuizGenerateAIDto)
		.mutation(async ({ ctx, input }) => {
			try {
				return await quizAIService.generateForLesson(
					input.lessonId,
					input.count,
					ctx.session.user.id,
					input.regenerate,
				);
			} catch (error) {
				handleServiceError(error);
			}
		}),
});
