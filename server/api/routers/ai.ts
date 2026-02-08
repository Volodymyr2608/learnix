import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
	processStepSchema,
	UpdateCourseGenerationStatusSchema,
} from "@/server/entities/course";
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
				console.error(error);
				throw new TRPCError({
					code: "BAD_REQUEST",
					// @ts-expect-error
					message: "Failed to process step",
				});
			}
		}),

	getGenerationStatus: protectedProcedure
		.input(processStepSchema)
		.query(async ({ input }) => {
			try {
				const courseGen = await courseGenerationRepository.findOne(
					input.courseGenerationId,
				);

				return {
					currentStep: courseGen?.step,
					sectionsData: courseGen?.content || {},
				};
			} catch (error) {
				console.error(error);
				throw new TRPCError({
					code: "BAD_REQUEST",
					// @ts-expect-error
					message: "Failed to get generation status",
				});
			}
		}),

	getActiveCourseGeneration: protectedProcedure.query(async ({ ctx }) => {
		try {
			const userId = ctx.session.user.id;
			return await courseGenerationRepository.findFirst({
				where: {
					instructorId: userId,
					status: "active",
				},
				orderBy: { createdAt: "desc" },
				include: {
					messages: {
						orderBy: { createdAt: "asc" },
						take: 50,
					},
				},
			});
		} catch (error) {
			console.error(error);
			throw new TRPCError({
				code: "BAD_REQUEST",
				// @ts-expect-error
				message: "Failed to get active course generation",
			});
		}
	}),

	setCourseGenerationStatus: protectedProcedure
		.input(UpdateCourseGenerationStatusSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				const userId = ctx.session.user.id;

				const entity = await courseGenerationRepository.findFirst({
					where: {
						id: input.id,
						instructorId: userId,
					},
				});

				if (!entity) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Course generation not found",
					});
				}

				return await courseGenerationRepository.update(input.id, {
					status: input.status,
				});
			} catch (error) {
				console.error(error);

				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Failed to update course generation status",
				});
			}
		}),
});
