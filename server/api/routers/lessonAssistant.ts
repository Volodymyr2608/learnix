import { z } from "zod";
import { lessonAssistantRepository } from "@/server/repositories/lessonAssistant.repository";
import { handleServiceError } from "@/server/utils/handleServiceError";
import { createTRPCRouter, studentProcedure } from "../trpc";

export const lessonAssistantRouter = createTRPCRouter({
	getHistory: studentProcedure
		.input(z.object({ lessonId: z.string() }))
		.query(async ({ input, ctx }) => {
			try {
				return await lessonAssistantRepository.getMessages(
					input.lessonId,
					ctx.session.user.id,
				);
			} catch (error) {
				handleServiceError(error);
			}
		}),

	clearHistory: studentProcedure
		.input(z.object({ lessonId: z.string() }))
		.mutation(async ({ input, ctx }) => {
			try {
				await lessonAssistantRepository.clearMessages(
					input.lessonId,
					ctx.session.user.id,
				);
			} catch (error) {
				handleServiceError(error);
			}
		}),
});