import { ChatOpenAI } from "@langchain/openai";
import { env } from "@/lib/env";
import type { CourseBuilderStateT } from "@/server/services/courseAI/graph/state";
import { withNodeErrors } from "@/server/services/courseAI/graph/withNodeErrors";
import { extractStepDataPrompt } from "@/server/services/courseAI/prompts/extractStepDataPrompt";
import { getExtractionSchemaForStep } from "@/server/services/courseAI/validators/getExtractionSchemaForStep";

export const extractStepData = withNodeErrors(
	"extract_step_data",
	async (state: CourseBuilderStateT, config) => {
		// Relaxed schema — no min/max so schema constraints don't leak into output.
		// Full validation runs in validate.ts.
		const schema = getExtractionSchemaForStep(state.currentStep);

		const model = new ChatOpenAI({
			model: "gpt-4o-mini",
			temperature: 0,
			apiKey: env.OPENAI_API_KEY,
		}).withStructuredOutput(schema, { method: "functionCalling" });

		// Filter to current step only — prior-step messages (e.g. "duration: 1 week"
		// from basic step) must not bleed into requirements/objectives extraction.
		const historyForPrompt = [
			...state.history.filter((m) => m.step === state.currentStep),
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
			courseData: state.content,
		});

		const draft = await model.invoke(
			[{ role: "system", content: prompt }],
			config,
		);

		return { draftStepData: draft };
	},
);
