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
		}).withStructuredOutput(outSchema);

		const historyText = [
			...state.history,
			{
				role: "assistant" as const,
				content: state.assistantText,
				step: state.currentStep,
			},
		]
			.map((m) => `[${m.role}@${m.step}]: ${m.content}`)
			.join("\n");

		const prompt =
			`Decide whether the "${state.currentStep}" step has enough information to be extracted into structured data without further user input.

Be CONSERVATIVE — false positives trigger premature auto-persist. Only return ready=true if a competent instructional designer would say "yes, ship this step as-is right now."

CONVERSATION:
${historyText}

CURRENT STRUCTURED CONTENT FOR THIS STEP:
${JSON.stringify(state.content[state.currentStep] ?? {}, null, 2)}`.trim();

		try {
			const out = await model.invoke([{ role: "user", content: prompt }]);
			return { assessReady: out.ready };
		} catch {
			return { assessReady: false };
		}
	},
);
