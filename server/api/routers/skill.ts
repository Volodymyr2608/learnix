import { skillService } from "@/server/services/skill/skill.service";
import { handleServiceError } from "@/server/utils/handleServiceError";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const skillRouter = createTRPCRouter({
	list: protectedProcedure.query(async () => {
		try {
			return await skillService.list();
		} catch (error) {
			handleServiceError(error);
		}
	}),
});
