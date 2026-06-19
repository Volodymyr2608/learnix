import { z } from "zod";
import { createReviewInput } from "@/server/entities/review/review.dto";
import { reviewService } from "@/server/services/review/review.service";
import { handleServiceError } from "@/server/utils/handleServiceError";
import { createTRPCRouter, studentProcedure } from "../trpc";

export const reviewRouter = createTRPCRouter({
	getEligibility: studentProcedure
		.input(z.object({ courseId: z.string().min(1) }))
		.query(async ({ ctx, input }) => {
			try {
				return await reviewService.getEligibility(
					ctx.session.user.id,
					input.courseId,
				);
			} catch (error) {
				handleServiceError(error);
			}
		}),

	create: studentProcedure
		.input(createReviewInput)
		.mutation(async ({ ctx, input }) => {
			try {
				return await reviewService.createReview(ctx.session.user.id, input);
			} catch (error) {
				handleServiceError(error);
			}
		}),
});
