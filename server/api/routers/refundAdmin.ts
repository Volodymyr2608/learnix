import { z } from "zod";
import { refundAppealAdminService } from "@/server/services/refund/refundAppealAdmin.service";
import { handleServiceError } from "@/server/utils/handleServiceError";
import { adminProcedure, createTRPCRouter } from "../trpc";

/** FR-A1–A3 (C17): every procedure is admin-only. Denials go through a multipart route (files). */
export const refundAdminRouter = createTRPCRouter({
	listOpenAppeals: adminProcedure.query(async () => {
		try {
			return await refundAppealAdminService.listOpenAppeals();
		} catch (error) {
			handleServiceError(error);
		}
	}),

	approveAppeal: adminProcedure
		.input(z.object({ appealId: z.string().min(1).max(64) }).strict())
		.mutation(async ({ ctx, input }) => {
			try {
				return await refundAppealAdminService.approveAppeal(
					ctx.session.user.id,
					input.appealId,
				);
			} catch (error) {
				handleServiceError(error);
			}
		}),

	/** FR-A6 (V14): refund any succeeded payment as an exception, with a reason. */
	refundException: adminProcedure
		.input(
			z
				.object({
					paymentId: z.string().min(1).max(64),
					reason: z.string().max(2000),
				})
				.strict(),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				return await refundAppealAdminService.refundException(
					ctx.session.user.id,
					input,
				);
			} catch (error) {
				handleServiceError(error);
			}
		}),
});
