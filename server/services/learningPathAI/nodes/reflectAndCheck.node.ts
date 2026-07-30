import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { env } from "@/lib/env";
import { UNTRUSTED_DATA_CLAUSE } from "@/server/services/_shared/aiGuard/messages";
import { wrapUntrustedContent } from "@/server/services/_shared/aiGuard/wrapUntrusted";
import type { PathState } from "../learningPathAI.state";

const CriticSchema = z.object({
	ok: z.boolean(),
	feedback: z.string(),
});

/**
 * Purpose: critiques the proposed path and, on rejection, loops back to mergeAndExplain with
 * feedback — capped at 2 attempts.
 * Reads: reflectionAttempt, finalSteps, weakConcepts, completedLessonIds.
 * Writes: reflectionFeedback, reflectionAttempt.
 * Fails: propagates a model error unguarded — learningPathAI has no withNodeErrors equivalent, so
 * it surfaces through handleServiceError as a 500.
 */
export async function reflectAndCheck(
	state: PathState,
): Promise<Partial<PathState>> {
	if (state.reflectionAttempt >= 2) {
		return { reflectionFeedback: undefined };
	}

	const critic = new ChatOpenAI({
		model: "gpt-4o-mini",
		temperature: 0,
		apiKey: env.OPENAI_API_KEY,
	}).withStructuredOutput(CriticSchema);

	const { ok, feedback } = await critic.invoke([
		{
			role: "system" as const,
			content: `Review the proposed learning path. Return ok=true if the path is reasonable. Return ok=false with concise feedback if: there are too many review steps relative to new lessons, weak concepts are not addressed, or steps are repeated.

${UNTRUSTED_DATA_CLAUSE}`,
		},
		{
			role: "human" as const,
			content: `${wrapUntrustedContent(
				JSON.stringify({
					steps: state.finalSteps,
					weakConcepts: state.weakConcepts,
				}),
				"path_candidates",
			)}
Completed lesson count: ${state.completedLessonIds.length}`,
		},
	]);

	if (ok) {
		return { reflectionFeedback: undefined };
	}

	return {
		reflectionFeedback: feedback,
		reflectionAttempt: state.reflectionAttempt + 1,
	};
}
