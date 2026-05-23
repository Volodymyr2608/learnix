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
	async (state) => {
		// Revision turns never auto-advance.
		if (state.intent === "revise") return { assessReady: false };

		const model = new ChatOpenAI({
			model: "gpt-4o-mini",
			temperature: 0,
			apiKey: env.OPENAI_API_KEY,
		}).withStructuredOutput(outSchema, { method: "functionCalling" });

		const historyText = [
			...state.history,
			...(state.userMessage
				? [
						{
							role: "user" as const,
							content: state.userMessage,
							step: state.currentStep,
						},
					]
				: []),
			{
				role: "assistant" as const,
				content: state.assistantText,
				step: state.currentStep,
			},
		]
			.map((m) => `[${m.role}]: ${m.content}`)
			.join("\n");

		const prompt =
			`Decide whether the "${state.currentStep}" step has enough concrete information in the conversation to be extracted into structured data.

Return ready=true when ANY of these are true:
- The conversation contains specific values for the required fields of this step.
- The user has explicitly approved AI-proposed content for this step (e.g. "ok", "yes", "looks good", "that's fine").
- The user asked to finalize or move on.

Return ready=false only when the step data is genuinely missing or incomplete and the user has not confirmed anything.

CONVERSATION:
${historyText}`.trim();

		try {
			const out = await model.invoke([{ role: "user", content: prompt }]);
			return { assessReady: out.ready };
		} catch {
			return { assessReady: false };
		}
	},
);
