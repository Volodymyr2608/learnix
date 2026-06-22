import { createTRPCRouter, studentProcedure } from "@/server/api/trpc";
import { certificateService } from "@/server/services/certificates/certificate.service";
import { handleServiceError } from "@/server/utils/handleServiceError";

export const certificateRouter = createTRPCRouter({
	listEarned: studentProcedure.query(async ({ ctx }) => {
		try {
			return await certificateService.listEarned(ctx.session.user.id);
		} catch (error) {
			handleServiceError(error);
		}
	}),
});
