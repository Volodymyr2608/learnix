import { z } from "zod";
import { conceptCheckRepository } from "@/server/repositories/conceptCheck.repository";
import { lessonAssistantRepository } from "@/server/repositories/lessonAssistant.repository";
import { aiRateLimit } from "@/server/services/_shared/aiLimits/aiRateLimit.middleware";
import { conceptCheckService } from "@/server/services/conceptCheck/conceptCheck.service";
import { handleServiceError } from "@/server/utils/handleServiceError";
import { createTRPCRouter, studentProcedure } from "../trpc";

export const lessonAssistantRouter = createTRPCRouter({
	getHistory: studentProcedure
		.input(z.object({ lessonId: z.string().max(64) }))
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

	/**
	 * The one check waiting for this student on this lesson, or null.
	 *
	 * Shares the lessonAI budget rather than getting its own: it belongs to that
	 * surface, and the client caches it per lesson, so it is not a hot path
	 * against a 20/min ceiling.
	 *
	 * Scoped to the caller's own id from the session — a `studentId` input would
	 * be an IDOR on someone else's open question. The payload is the repository's
	 * keyless projection, so `correct` is not merely omitted here: it is never
	 * loaded.
	 */
	pendingCheck: studentProcedure
		.use(aiRateLimit("lessonAI"))
		.input(z.object({ lessonId: z.string().max(64) }))
		.query(async ({ input, ctx }) => {
			try {
				return await conceptCheckRepository.findPendingPublic(
					ctx.session.user.id,
					input.lessonId,
				);
			} catch (error) {
				handleServiceError(error);
			}
		}),

	/**
	 * Grades the open check, once.
	 *
	 * The input is a check id and a POSITION — never option text, and never a
	 * concept or a level. Everything written is read from the row the claim
	 * returns, so the client cannot influence what is recorded or about what.
	 *
	 * Every way this can fail is one `CheckUnavailableError` with one message, so
	 * a caller walking ids learns nothing about which exist or whose they are.
	 */
	answerConceptCheck: studentProcedure
		.use(aiRateLimit("lessonAI"))
		.input(
			z.object({
				checkId: z.string().max(64),
				optionIndex: z.number().int().min(0).max(4),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			try {
				return await conceptCheckService.answer({
					studentId: ctx.session.user.id,
					checkId: input.checkId,
					optionIndex: input.optionIndex,
				});
			} catch (error) {
				handleServiceError(error);
			}
		}),

	clearHistory: studentProcedure
		.input(z.object({ lessonId: z.string().max(64) }))
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
