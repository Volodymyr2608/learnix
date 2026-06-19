import {
	createTRPCRouter,
	instructorProcedure,
	publicProcedure,
} from "@/server/api/trpc";
import { instructorSchema } from "@/server/entities/instructor";
import {
	getReviewStatsInput,
	getReviewsInput,
} from "@/server/entities/instructor/reviews";
import { getStudentsInput } from "@/server/entities/instructor/students";
import { instructorService } from "@/server/services/instructor/instructor.service";
import { handleServiceError } from "@/server/utils/handleServiceError";

export const instructorRouter = createTRPCRouter({
	create: publicProcedure
		.input(instructorSchema)
		.mutation(async ({ input }) => {
			try {
				return await instructorService.createInstructor(input);
			} catch (error) {
				handleServiceError(error);
			}
		}),

	getDashboardStats: instructorProcedure.query(async ({ ctx }) => {
		try {
			return await instructorService.getDashboardStats(ctx.session.user.id);
		} catch (error) {
			handleServiceError(error);
		}
	}),

	getTopPerformingCourses: instructorProcedure.query(async ({ ctx }) => {
		try {
			return await instructorService.getTopPerformingCourses(
				ctx.session.user.id,
			);
		} catch (error) {
			handleServiceError(error);
		}
	}),

	getRecentActivity: instructorProcedure.query(async ({ ctx }) => {
		try {
			return await instructorService.getRecentActivity(ctx.session.user.id);
		} catch (error) {
			handleServiceError(error);
		}
	}),

	getStudents: instructorProcedure
		.input(getStudentsInput)
		.query(async ({ ctx, input }) => {
			try {
				return await instructorService.getStudents(ctx.session.user.id, input);
			} catch (error) {
				handleServiceError(error);
			}
		}),

	getStudentStatusCounts: instructorProcedure.query(async ({ ctx }) => {
		try {
			return await instructorService.getStudentStatusCounts(
				ctx.session.user.id,
			);
		} catch (error) {
			handleServiceError(error);
		}
	}),

	getReviewCourseOptions: instructorProcedure.query(async ({ ctx }) => {
		try {
			return await instructorService.getReviewCourseOptions(
				ctx.session.user.id,
			);
		} catch (error) {
			handleServiceError(error);
		}
	}),

	getReviewStats: instructorProcedure
		.input(getReviewStatsInput)
		.query(async ({ ctx, input }) => {
			try {
				return await instructorService.getReviewStats(
					ctx.session.user.id,
					input,
				);
			} catch (error) {
				handleServiceError(error);
			}
		}),

	getReviews: instructorProcedure
		.input(getReviewsInput)
		.query(async ({ ctx, input }) => {
			try {
				return await instructorService.getReviews(ctx.session.user.id, input);
			} catch (error) {
				handleServiceError(error);
			}
		}),
});
