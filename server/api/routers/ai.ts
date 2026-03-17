import { TRPCError } from "@trpc/server";
import type { CourseGenerationWithRelations } from "@/prisma/zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import type { CourseSchemaOutput } from "@/server/entities/course";
import {
	processStepSchema,
	UpdateCourseGenerationStatusSchema,
} from "@/server/entities/course";
import { courseGenerationRepository } from "@/server/repositories/courseGeneration.repository";
import { courseAIService } from "@/server/services/courseAI/courseAI.service";

export const courseAIRouter = createTRPCRouter({
	acceptStep: protectedProcedure
		.input(processStepSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				const { courseGenerationId } = input;

				return await courseAIService.acceptStep({
					courseGenerationId,
					userId: ctx.session.user.id,
				});
			} catch (error) {
				console.error(error);
				throw new TRPCError({
					code: "BAD_REQUEST",
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
					sectionsData: courseGen?.content
						? (courseGen?.content as unknown as CourseSchemaOutput)
						: {},
				};
			} catch (error) {
				console.error(error);
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Failed to get generation status",
				});
			}
		}),

	getActiveCourseGeneration: protectedProcedure.query(async ({ ctx }) => {
		try {
			const userId = ctx.session.user.id;
			const data = await courseGenerationRepository.findFirst({
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
			return data as CourseGenerationWithRelations;
		} catch (error) {
			console.error(error);
			throw new TRPCError({
				code: "BAD_REQUEST",
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
