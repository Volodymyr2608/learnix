import { CourseFullCreateDto } from "@/server/entities/course";
import { courseRepository } from "@/server/repositories/courseRepository";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const courseRouter = createTRPCRouter({
	create: protectedProcedure
		.input(CourseFullCreateDto)
		.mutation(async ({ input }) => {
			return await courseRepository.createCourse(input);
		}),
});
