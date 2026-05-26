import { ChatOpenAI } from "@langchain/openai";
import { env } from "@/lib/env";
import type { CourseBuilderStateT } from "@/server/services/courseAI/graph/state";
import { withNodeErrors } from "@/server/services/courseAI/graph/withNodeErrors";

export const clarify = withNodeErrors(
	"clarify",
	async (state: CourseBuilderStateT, config) => {
		const model = new ChatOpenAI({
			model: "gpt-4o-mini",
			temperature: 0.3,
			apiKey: env.OPENAI_API_KEY,
			streaming: true,
		});

		// assess_completion routes here when the user's intent was ambiguous.
		// clarify also handles validation failures from the validate node.
		const isAssessClarify =
			!state.validationErrors || state.validationErrors.length === 0;

		const prompt = isAssessClarify
			? `Ask the user the following question, in a friendly and concise way, in the same language as the conversation: "${state.assessClarify ?? "Everything looks good — shall I finalize this step and move on?"}"`
			: (() => {
					const issues = (state.validationErrors ?? [])
						.map((issue, i) => `${i + 1}. ${JSON.stringify(issue)}`)
						.join("\n");
					return `You just tried to finalize the "${state.currentStep}" step but validation failed. Ask the user ONE concise, friendly follow-up question (in their language) that would unblock the most important missing field. Do not list every error. Do not show JSON.

			VALIDATION ERRORS:
			${issues}

			EXTRACTED (FAILING) DATA:
			${JSON.stringify(state.draftStepData, null, 2)}`;
				})();

		const stream = await model.stream(
			[{ role: "system", content: prompt }],
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
