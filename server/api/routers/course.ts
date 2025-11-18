import { TRPCError } from "@trpc/server";
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
});
