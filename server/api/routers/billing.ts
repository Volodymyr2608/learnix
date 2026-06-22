import { createTRPCRouter, studentProcedure } from "@/server/api/trpc";
import { billingService } from "@/server/services/billing/billing.service";
import { handleServiceError } from "@/server/utils/handleServiceError";

export const billingRouter = createTRPCRouter({
	listPurchases: studentProcedure.query(async ({ ctx }) => {
		try {
			return await billingService.listPurchases(ctx.session.user.id);
		} catch (error) {
			handleServiceError(error);
		}
	}),
});
