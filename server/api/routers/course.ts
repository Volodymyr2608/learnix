import { TRPCError } from "@trpc/server";
import { CourseSchema } from "@/prisma/zod";
import { CourseFullCreateDto } from "@/server/entities/course";
import { courseRepository } from "@/server/repositories/courseRepository";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const courseRouter = createTRPCRouter({
	create: protectedProcedure
		.input(CourseFullCreateDto)
		.mutation(async ({ input }) => {
			try {
				return await courseRepository.createCourse(input);
			} catch (error: unknown) {
				if (error instanceof Error) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: error.message,
					});
				}

				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Unknown error",
				});
			}
		}),

	getOwnCourses: protectedProcedure.query(async ({ ctx }) => {
		try {
			return await courseRepository.getOwnCourses(ctx.session.user.id);
		} catch (error: unknown) {
			if (error instanceof Error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: error.message,
				});
			}

			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Unknown error",
			});
		}
	}),

	getOwnCourse: protectedProcedure
		.input(CourseSchema.shape.id)
		.query(async ({ ctx, input }) => {
			try {
				const course = await courseRepository.getCourseByIdAndInstructorId(
					input,
					ctx.session.user.id,
				);

				if (!course) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Course not found or access denied",
					});
				}

				return course;
			} catch (error: unknown) {
				if (error instanceof TRPCError) {
					throw error;
				}

				if (error instanceof Error) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: error.message,
					});
				}

				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Unknown error",
				});
			}
		}),
});
