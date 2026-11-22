import { refundRequestInput } from "@/server/entities/refund/refund.dto";
import { refundService } from "@/server/services/refund/refund.service";
import { handleServiceError } from "@/server/utils/handleServiceError";
import { createTRPCRouter, studentProcedure } from "../trpc";

export const refundRouter = createTRPCRouter({
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
