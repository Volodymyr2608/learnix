import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { env } from "@/lib/env";
import type { PathState } from "../learningPathAI.state";

const CriticSchema = z.object({
	ok: z.boolean(),
	feedback: z.string(),
});

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
			content:
				"Review the proposed learning path. Return ok=true if the path is reasonable. Return ok=false with concise feedback if: there are too many review steps relative to new lessons, weak concepts are not addressed, or steps are repeated.",
		},
		{
			role: "human" as const,
			content: JSON.stringify({
				steps: state.finalSteps,
				weakConcepts: state.weakConcepts,
				completedLessonCount: state.completedLessonIds.length,
			}),
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
