import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { processStepSchema } from "@/server/entities/course";
import { courseGenerationRepository } from "@/server/repositories/courseGenerationRepository";
import { courseAIService } from "@/server/services/courseAI.service";

export const courseAIRouter = createTRPCRouter({
	processStep: protectedProcedure
		.input(processStepSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				const { courseGenerationId } = input;

				const courseGen = await courseAIService.getOrCreateCourseGeneration({
					courseGenerationId,
					userId: ctx.session.user.id,
				});

				if (!courseGen) throw new TRPCError({ code: "NOT_FOUND" });

				const extractedData = await courseAIService.extractStepData(courseGen);

				await courseGenerationRepository.updateContent(
					courseGenerationId,
					courseGen.step,
					extractedData,
				);

				return {
					step: courseGen.step,
					data: extractedData,
				};
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					// @ts-expect-error
					message: error.message,
				});
			}
		}),

	getGenerationStatus: protectedProcedure
		.input(processStepSchema)
		.query(async ({ input }) => {
			const courseGen = await courseGenerationRepository.findOne(
				input.courseGenerationId,
			);

			return {
				currentStep: courseGen?.step,
				sectionsData: courseGen?.content || {},
			};
		}),
});
