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

			Return ready=true ONLY when ALL of the following are true:
			1. The user's message is a clear, standalone approval or confirmation: "ok", "yes", "looks good", "alright", "perfect", "go ahead", "proceed", "confirm", "next", "move on", "sounds good", "that's fine", "great", etc.
			2. The user is NOT making a request, asking a question, or providing information — they are simply accepting what was proposed.
			3. The assistant's most recent message was presenting or discussing content for the CURRENT "${state.currentStep}" step, NOT confirming a revision to an already-committed step.

			Return ready=false when:
			- The user's message contains a change request ("can you change", "update", "add", "remove", "make it", "adjust", etc.).
			- The user is asking a question.
			- The user is providing information or corrections.
			- The most recent AI message was confirming a change to a previously committed step — the user's approval would be acknowledging that revision, not committing the current step.

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
