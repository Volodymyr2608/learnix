import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { env } from "@/lib/env";
import { withNodeErrors } from "@/server/services/courseAI/graph/withNodeErrors";

const outSchema = z.object({
	ready: z.boolean(),
	reason: z.string(),
});

export const assessCompletion = withNodeErrors(
	"assess_completion",
	async (state, config) => {
		// Auto-trigger, revision, and clarify turns must never commit.
		if (
			!state.userMessage ||
			state.intent === "revise" ||
			state.intent === "clarify"
		)
			return { assessReady: false };

		const model = new ChatOpenAI({
			model: "gpt-4o-mini",
			temperature: 0,
			apiKey: env.OPENAI_API_KEY,
		}).withStructuredOutput(outSchema, { method: "functionCalling" });

		const historyText = [
			...state.history.filter((m) => m.step === state.currentStep),
			{
				role: "user" as const,
				content: state.userMessage,
				step: state.currentStep,
			},
			{
				role: "assistant" as const,
				content: state.assistantText,
				step: state.currentStep,
			},
		]
			.map((m) => `[${m.role}]: ${m.content}`)
			.join("\n");

		const prompt =
			`Decide whether the user has explicitly confirmed the content for the "${state.currentStep}" step.

			Return ready=true when the user's latest message is a clear approval ("ok", "yes", "looks good", "alright", "perfect", "go ahead", "proceed", "confirm", "next", "move on", etc.) directed at approving the CURRENT "${state.currentStep}" step as a whole — regardless of any field tweaks that happened earlier in this same step.

			Return ready=false when:
			- The most recent AI message confirmed a revision to a PREVIOUSLY COMMITTED step (a step that was already finished before this one). In that case the user's approval is acknowledging that earlier-step revision, not confirming the current step.
			- The user asked a question, made a correction, or is still discussing content.
			- The user provided new information without explicitly confirming.

			NOTE: If the user made field changes WITHIN the current "${state.currentStep}" step (e.g., adjusted the level, duration, or category for a step that has not yet been committed), a subsequent "ok" / "yes" / "looks good" IS a valid confirmation of that step — return ready=true.

			CONVERSATION:
			${historyText}`.trim();

		try {
			const out = await model.invoke(
				[{ role: "user", content: prompt }],
				config,
			);
			return { assessReady: out.ready };
		} catch {
			return { assessReady: false };
		}
	},
);
