import { TRPCError } from "@trpc/server";
import { createTRPCMiddleware } from "@/server/api/trpc";
import type { AiRateLimitFeature } from "./checkAiRateLimit";
import { checkAiRateLimit } from "./checkAiRateLimit";

/**
 * A MIDDLEWARE composed onto an existing role procedure:
 *
 *   generateAI: instructorProcedure.use(aiRateLimit("quizAI")).input(…)
 *
 * Never a standalone `aiProcedure` base — a base is the shape that silently
 * REPLACES instructorProcedure at a call site and takes the role check with it.
 *
 * LIMIT OF THE TYPE SYSTEM: t.middleware types its callback against the ROOT
 * context, so contravariance lets this attach to publicProcedure too. That
 * misuse is caught by aiLimits.contract.test.ts's scan over the router tree,
 * not by tsc.
 *
 * The key is ctx.session.user.id and nothing else. A key derived from input
 * would let a caller choose whose budget to spend.
 */
export const aiRateLimit = (feature: AiRateLimitFeature) =>
	createTRPCMiddleware(async ({ ctx, next }) => {
		const userId = ctx.session?.user?.id;
		if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

		if (!(await checkAiRateLimit(userId, feature))) {
			throw new TRPCError({
				code: "TOO_MANY_REQUESTS",
				message: "Too many AI requests — please try again shortly.",
			});
		}

		return next();
	});
