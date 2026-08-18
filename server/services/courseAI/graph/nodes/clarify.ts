import { ChatOpenAI } from "@langchain/openai";
import { env } from "@/lib/env";
import {
	MODEL_MAX_RETRIES,
	MODEL_TIMEOUT_MS,
} from "@/server/services/_shared/aiLimits/modelDefaults";
import type { CourseBuilderStateT } from "@/server/services/courseAI/graph/state";
import { withNodeErrors } from "@/server/services/courseAI/graph/withNodeErrors";
import {
	assessClarifyPrompt,
	validationFailurePrompt,
} from "@/server/services/courseAI/prompts/clarifyPrompts";

/**
 * Purpose: streams one clarifying question — either the ambiguous-intent question from
 * assess_completion or a follow-up on a validation failure.
 * Reads: validationErrors, assessClarify, currentStep, draftStepData, last 4 history entries,
 * userMessage.
 * Writes: assistantText.
 * Fails: propagates — model.stream is unguarded.
 */
export const clarify = withNodeErrors(
	"clarify",
	async (state: CourseBuilderStateT, config) => {
		const model = new ChatOpenAI({
			model: "gpt-4o-mini",
			temperature: 0.3,
			apiKey: env.OPENAI_API_KEY,
			streaming: true,
			timeout: MODEL_TIMEOUT_MS,
			maxRetries: MODEL_MAX_RETRIES,
		});

		// assess_completion routes here when the user's intent was ambiguous.
		// clarify also handles validation failures from the validate node.
		const isAssessClarify =
			!state.validationErrors || state.validationErrors.length === 0;

		// assessClarify, the validation errors and draftStepData are all model
		// output: the question another node's model wrote, and zod's report on the
		// data a model extracted. Streamed straight back to the instructor, so the
		// region has to be marked even though it never left the platform.
		const prompt = isAssessClarify
			? assessClarifyPrompt(state.assessClarify)
			: validationFailurePrompt({
					step: state.currentStep,
					validationErrors: state.validationErrors ?? [],
					draftStepData: state.draftStepData,
				});

		// Pass the recent conversation so the model has a real language anchor.
		// Without this, "respond in the user's language" has nothing to match
		// and the model drifts to Spanish/French.
		const conversation = state.history
			.slice(-4)
			.map((m) => ({ role: m.role, content: m.content }));

		const stream = await model.stream(
			[
				{ role: "system" as const, content: prompt },
				...conversation,
				...(state.userMessage
					? [{ role: "user" as const, content: state.userMessage }]
					: []),
			],
			config,
		);

		let text = "";
		for await (const chunk of stream) {
			const token = chunk.content?.toString();
			if (token) text += token;
		}

		return { assistantText: text };
	},
);
