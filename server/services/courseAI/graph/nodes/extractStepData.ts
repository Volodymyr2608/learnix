import { ChatOpenAI } from "@langchain/openai";
import { env } from "@/lib/env";
import type { CourseBuilderStateT } from "@/server/services/courseAI/graph/state";
import { withNodeErrors } from "@/server/services/courseAI/graph/withNodeErrors";
import { extractStepDataPrompt } from "@/server/services/courseAI/prompts/extractStepDataPrompt";
import { getValidatorForStep } from "@/server/services/courseAI/validators/getValidatorForStep";

export const extractStepData = withNodeErrors(
	"extract_step_data",
	async (state: CourseBuilderStateT, config) => {
		const schema = getValidatorForStep(state.currentStep);

		const model = new ChatOpenAI({
			model: "gpt-4o-mini",
			temperature: 0,
			apiKey: env.OPENAI_API_KEY,
		}).withStructuredOutput(schema, { method: "functionCalling" });

		const historyForPrompt = [
			...state.history,
			...(state.assistantText
				? [
						{
							role: "assistant" as const,
							content: state.assistantText,
							step: state.currentStep,
						},
					]
				: []),
			...(state.userMessage
				? [
						{
							role: "user" as const,
							content: state.userMessage,
							step: state.currentStep,
						},
					]
				: []),
		]
			.map((m) => `[${m.role}]: ${m.content}`)
			.join("\n");

		const prompt = extractStepDataPrompt({
			step: state.currentStep,
			history: historyForPrompt,
		});

		const draft = await model.invoke([{ role: "system", content: prompt }], config);

		return { draftStepData: draft };
	},
);
