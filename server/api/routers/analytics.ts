import { z } from "zod";
import { createTRPCRouter, instructorProcedure } from "@/server/api/trpc";
import { statsRangeInput } from "@/server/entities/stats/range";
import { analyticsService } from "@/server/services/analytics/analytics.service";
import { handleServiceError } from "@/server/utils/handleServiceError";

const courseInput = z.object({ courseId: z.string() });
const courseRangeInput = courseInput.merge(statsRangeInput);

export const analyticsRouter = createTRPCRouter({
	getOverviewSummary: instructorProcedure.query(async ({ ctx }) => {
		try {
			return await analyticsService.getOverviewSummary(ctx.session.user.id);
		} catch (error) {
			handleServiceError(error);
		}
	}),

	getEnrollmentTrend: instructorProcedure
		.input(statsRangeInput)
		.query(async ({ ctx, input }) => {
			try {
				return await analyticsService.getEnrollmentTrend(
					ctx.session.user.id,
					input.range,
				);
			} catch (error) {
				handleServiceError(error);
			}
		}),

	getCompletionTrend: instructorProcedure
		.input(statsRangeInput)
		.query(async ({ ctx, input }) => {
			try {
				return await analyticsService.getCompletionTrend(
					ctx.session.user.id,
					input.range,
				);
			} catch (error) {
				handleServiceError(error);
			}
		}),

	getEnrollmentsByCourse: instructorProcedure
		.input(statsRangeInput)
		.query(async ({ ctx, input }) => {
			try {
				return await analyticsService.getEnrollmentsByCourse(
					ctx.session.user.id,
					input.range,
				);
			} catch (error) {
				handleServiceError(error);
			}
		}),

	getCourseSummary: instructorProcedure
		.input(courseInput)
		.query(async ({ ctx, input }) => {
			try {
				return await analyticsService.getCourseSummary(
					ctx.session.user.id,
					input.courseId,
				);
			} catch (error) {
				handleServiceError(error);
			}
		}),

	getCourseEnrollmentTrend: instructorProcedure
		.input(courseRangeInput)
		.query(async ({ ctx, input }) => {
			try {
				return await analyticsService.getCourseEnrollmentTrend(
					ctx.session.user.id,
					input.courseId,
					input.range,
				);
			} catch (error) {
				handleServiceError(error);
			}
		}),

	getLessonFunnel: instructorProcedure
		.input(courseInput)
		.query(async ({ ctx, input }) => {
			try {
				return await analyticsService.getLessonFunnel(
					ctx.session.user.id,
					input.courseId,
				);
			} catch (error) {
				handleServiceError(error);
			}
		}),
});
