import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { CourseSchema } from "@/prisma/zod";
import {
	CourseFullCreateDto,
	CourseFullUpdateDto,
} from "@/server/entities/course";
import { courseRepository } from "@/server/repositories/course.repository";
import { courseService } from "@/server/services/course/course.service";
import { enrollmentService } from "@/server/services/enrollment/enrollment.service";
import { handleServiceError } from "@/server/utils/handleServiceError";
import {
	createTRPCRouter,
	instructorProcedure,
	protectedProcedure,
	studentProcedure,
} from "../trpc";

export const courseRouter = createTRPCRouter({
	create: instructorProcedure
		.input(CourseFullCreateDto)
		.mutation(async ({ input }) => {
			try {
				return await courseService.createCourse(input);
			} catch (error) {
				handleServiceError(error);
			}
		}),

	update: instructorProcedure
		.input(CourseFullUpdateDto)
		.mutation(async ({ input }) => {
			try {
				return await courseService.updateCourse(input.id, input);
			} catch (error) {
				handleServiceError(error);
			}
		}),

	delete: instructorProcedure
		.input(CourseSchema.shape.id)
		.mutation(async ({ input }) => {
			try {
				return await courseRepository.deleteCourse(input, true);
			} catch (error) {
				handleServiceError(error);
			}
		}),

	getOwnCourses: instructorProcedure.query(async ({ ctx }) => {
		try {
			return await courseRepository.getOwnCourses(ctx.session.user.id);
		} catch (error) {
			handleServiceError(error);
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
			} catch (error) {
				handleServiceError(error);
			}
		}),

	getCoursesStats: instructorProcedure.query(async ({ ctx }) => {
		try {
			return await courseRepository.getCoursesStats(ctx.session.user.id);
		} catch (error) {
			handleServiceError(error);
		}
	}),

	getPublishedCourses: protectedProcedure
		.input(
			z.object({
				q: z.string().optional(),
				category: z.string().optional(),
				page: z.number().int().min(1).default(1),
			}),
		)
		.query(async ({ input }) => {
			try {
				return await courseRepository.getPublishedCourses(input);
			} catch (error) {
				handleServiceError(error);
			}
		}),

	getPublishedCourse: protectedProcedure
		.input(CourseSchema.shape.id)
		.query(async ({ input }) => {
			try {
				return await courseService.getPublishedCourse(input);
			} catch (error) {
				handleServiceError(error);
			}
		}),

	enroll: studentProcedure
		.input(CourseSchema.shape.id)
		.mutation(async ({ ctx, input }) => {
			try {
				return await enrollmentService.enrollInCourse(
					ctx.session.user.id,
					input,
				);
			} catch (error) {
				handleServiceError(error);
			}
		}),

	getEnrolledCourses: studentProcedure
		.input(
			z.object({
				tab: z.enum(["all", "in-progress", "completed"]).default("all"),
				page: z.number().int().min(1).default(1),
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				return await enrollmentService.getStudentEnrolledCourses(
					ctx.session.user.id,
					input,
				);
			} catch (error) {
				handleServiceError(error);
			}
		}),

	getEnrolledCourse: studentProcedure
		.input(CourseSchema.shape.id)
		.query(async ({ ctx, input }) => {
			try {
				const course = await enrollmentService.getStudentCourse(
					ctx.session.user.id,
					input,
				);

				if (!course) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Course not found or not enrolled",
					});
				}

				return course;
			} catch (error) {
				handleServiceError(error);
			}
		}),
});
