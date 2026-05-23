import { TRPCError } from "@trpc/server";
import type { CourseGenerationWithRelations } from "@/prisma/zod";
import { createTRPCRouter, instructorProcedure } from "@/server/api/trpc";
import type { CourseSchemaOutput } from "@/server/entities/course";
import {
	processStepSchema,
	UpdateCourseGenerationStatusSchema,
} from "@/server/entities/course";
import { courseGenerationRepository } from "@/server/repositories/courseGeneration.repository";
import { handleServiceError } from "@/server/utils/handleServiceError";

export const courseAIRouter = createTRPCRouter({
	getGenerationStatus: instructorProcedure
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
				handleServiceError(error);
			}
		}),

	getActiveCourseGeneration: instructorProcedure.query(async ({ ctx }) => {
		try {
			const data = await courseGenerationRepository.findFirst({
				where: { instructorId: ctx.session.user.id, status: "active" },
				orderBy: { createdAt: "desc" },
				include: { messages: { orderBy: { createdAt: "asc" }, take: 50 } },
			});
			return data as CourseGenerationWithRelations;
		} catch (error) {
			handleServiceError(error);
		}
	}),

	setCourseGenerationStatus: instructorProcedure
		.input(UpdateCourseGenerationStatusSchema)
		.mutation(async ({ ctx, input }) => {
			const entity = await courseGenerationRepository.findFirst({
				where: { id: input.id, instructorId: ctx.session.user.id },
			});
			if (!entity) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Course generation not found",
				});
			}
			try {
				return await courseGenerationRepository.update(input.id, {
					status: input.status,
				});
			} catch (error) {
				handleServiceError(error);
			}
		}),
});