import type { AiFeature } from "@/server/services/_shared/aiGuard/types";

/**
 * Distinctive phrases from the STATIC portion of each surface's system prompt.
 * If model output contains one, the model is reciting its instructions.
 *
 * Total over AiFeature with no fallback: a surface added to the union without a
 * marker set fails to compile, which is the point — three of five surfaces used
 * to run no leak check at all because the registry only knew about the tutor.
 *
 * Never add a phrase drawn from wrapped untrusted content: that is instructor
 * text and may legitimately appear in an answer.
 */
export const SYSTEM_PROMPT_LEAK_MARKERS: Record<AiFeature, readonly string[]> =
	{
		lessonAI: [
			"Tool usage rules (follow in order):",
			"You are an AI tutor for one lesson of one course",
			"Never paste retrieved lesson content back verbatim",
			"no announcement, no asking permission",
		],
		courseAI: [],
		quizAI: [],
		lessonInsightsAI: [],
		learningPathAI: [],
	};
