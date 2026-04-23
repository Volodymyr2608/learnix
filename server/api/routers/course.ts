import { TRPCError } from "@trpc/server";
import { CourseSchema } from "@/prisma/zod";
import {
	CourseFullCreateDto,
	CourseFullUpdateDto,
} from "@/server/entities/course";
import { courseRepository } from "@/server/repositories/course.repository";
import { courseService } from "@/server/services/course/course.service";
import {
	createTRPCRouter,
	instructorProcedure,
	protectedProcedure,
} from "../trpc";

export const courseRouter = createTRPCRouter({
	create: instructorProcedure
		.input(CourseFullCreateDto)
		.mutation(async ({ input }) => {
			try {
				return await courseService.createCourse(input);
			} catch (error: unknown) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					// @ts-expect-error
					message: error.message,
				});
			}
		}),

	update: instructorProcedure
		.input(CourseFullUpdateDto)
		.mutation(async ({ input }) => {
			try {
				return await courseService.updateCourse(input.id, input);
			} catch (error: unknown) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					// @ts-expect-error
					message: error.message,
				});
			}
		}),

	delete: instructorProcedure
		.input(CourseSchema.shape.id)
		.mutation(async ({ input }) => {
			try {
				return await courseRepository.deleteCourse(input, true);
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

	getOwnCourses: instructorProcedure.query(async ({ ctx }) => {
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

	getOwnCourse: instructorProcedure
		.input(CourseSchema.shape.id)
		.query(async ({ ctx, input }) => {
			try {
				const course = await courseRepository.getOwnCourse(
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

	getCoursesStats: instructorProcedure.query(async ({ ctx }) => {
		try {
			return await courseRepository.getCoursesStats(ctx.session.user.id);
		} catch (error) {
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

	getPublishedCourses: protectedProcedure.query(async () => {
		try {
			return await courseRepository.getPublishedCourses();
		} catch (error) {
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

	getPublishedCourse: protectedProcedure
		.input(CourseSchema.shape.id)
		.query(async ({ input }) => {
			try {
				return await courseService.getPublishedCourse(input);
			} catch (error) {
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
