import { z } from "zod";
import { refundRequestInput } from "@/server/entities/refund/refund.dto";
import { refundService } from "@/server/services/refund/refund.service";
import { handleServiceError } from "@/server/utils/handleServiceError";
import {
	createTRPCRouter,
	protectedProcedure,
	studentProcedure,
} from "../trpc";

export const refundRouter = createTRPCRouter({
	/** EC-12 (W12): the courses whose open appeal an account deletion would close. */
	openAppeals: protectedProcedure.query(async ({ ctx }) => {
		try {
			return await refundService.openAppealCourses(
				ctx.session.user.id,
				ctx.session.user.role,
			);
		} catch (error) {
			handleServiceError(error);
		}
	}),

	/** FR-S23 (W9): whether a repurchase of this course could be refunded again. */
	repurchaseWarning: studentProcedure
		.input(z.object({ courseId: z.string().min(1).max(64) }).strict())
		.query(async ({ ctx, input }) => {
			try {
				return {
					notRefundable: await refundService.repurchaseWarning(
						ctx.session.user.id,
						input.courseId,
					),
				};
			} catch (error) {
				handleServiceError(error);
			}
		}),

	/** U5: the refund page's state for the session's own payment (C1, C23, C24). */
	getForPayment: studentProcedure
		.input(z.object({ paymentId: z.string().min(1).max(64) }).strict())
		.query(async ({ ctx, input }) => {
			try {
				return await refundService.getRefundPage(
					ctx.session.user.id,
					input.paymentId,
				);
			} catch (error) {
				handleServiceError(error);
			}
		}),

	/** FR-S5/S6: the student id comes from the session, never from the input (C1). */
	request: studentProcedure
		.input(refundRequestInput)
		.mutation(async ({ ctx, input }) => {
			try {
				return await refundService.requestRefund(ctx.session.user.id, input);
			} catch (error) {
				handleServiceError(error);
			}
		}),
});
