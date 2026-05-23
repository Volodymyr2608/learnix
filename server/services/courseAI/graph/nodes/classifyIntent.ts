import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { DraftStep } from "@/generated/prisma";
import { env } from "@/lib/env";
import { withNodeErrors } from "@/server/services/courseAI/graph/withNodeErrors";

const outSchema = z.object({
	intent: z.enum(["continue", "revise", "clarify"]),
	reviseTarget: z.enum(Object.values(DraftStep) as [DraftStep, ...DraftStep[]]).nullable(),
	reason: z.string(),
});

export const classifyIntent = withNodeErrors(
	"classify_intent",
	async (state, config) => {
		// First turn cannot revise: skip the LLM call.
		if (state.history.length === 0) {
			return { intent: "continue" as const, reviseTarget: null };
		}

		const model = new ChatOpenAI({
			model: "gpt-4o-mini",
			temperature: 0,
			apiKey: env.OPENAI_API_KEY,
		}).withStructuredOutput(outSchema, { method: "functionCalling" });

		const historyText = state.history
			.map((m) => `[${m.role}@${m.step}]: ${m.content}`)
			.join("\n");

		const prompt = `Classify the user's latest turn.

			CURRENT STEP: ${state.currentStep}
			
			CONVERSATION SO FAR:
			${historyText}
			
			USER'S NEW MESSAGE:
			${state.userMessage}
			
			Decide:
			- "continue": the user is clearly moving forward or answering for the current step.
			- "revise": the user clearly wants to change a value from an earlier step.
			- "clarify": you genuinely cannot tell which applies. Use sparingly — only when the message is truly ambiguous between revising an earlier field and continuing the current step.
			
			When returning "clarify", write a short, friendly question in "reason" that would resolve the ambiguity (e.g. "Did you mean to update the level from the Basic Info step, or are you adding detail for the current ${state.currentStep} step?").
			
			Otherwise default to "continue".`.trim();

		try {
			const out = await model.invoke([{ role: "user", content: prompt }], config);
			return {
				intent: out.intent,
				reviseTarget: out.intent === "revise" ? out.reviseTarget : null,
			};
		} catch {
			return { intent: "continue" as const, reviseTarget: null };
		}
	},
);