import { ChatOpenAI } from "@langchain/openai";
import { env } from "@/lib/env";
import { withNodeErrors } from "@/server/services/courseAI/graph/withNodeErrors";
import { getValidatorForStep } from "@/server/services/courseAI/validators/getValidatorForStep";

export const revisePriorField = withNodeErrors(
	"revise_prior_field",
	async (state) => {
		if (!state.reviseTarget) {
			return { assistantText: "I couldn't tell which field to revise." };
		}

		const target = state.reviseTarget;
		const partial = getValidatorForStep(target).partial();

		const model = new ChatOpenAI({
			model: "gpt-4o-mini",
			temperature: 0,
			apiKey: env.OPENAI_API_KEY,
		}).withStructuredOutput(partial, { strict: false });

		const prompt = `The user wants to revise a field in the "${target}" step.
Current values for that step: ${JSON.stringify(state.content[target] ?? {}, null, 2)}
User's revision request: "${state.userMessage}"

Return ONLY the fields that should change. Do not repeat unchanged fields.`.trim();

		const patch = await model.invoke([{ role: "user", content: prompt }]);

		const mergedTargetContent = {
			...((state.content[target] as Record<string, unknown> | undefined) ?? {}),
			...(patch as Record<string, unknown>),
		};

		const nextContent = { ...state.content, [target]: mergedTargetContent };
		const summary = `Updated ${target}: ${Object.keys(patch as object).join(", ")}.`;

		return { content: nextContent, assistantText: summary };
	},
);
