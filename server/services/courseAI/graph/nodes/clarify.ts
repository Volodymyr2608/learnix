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

		const issues = (state.validationErrors ?? [])
			.map((issue, i) => `${i + 1}. ${JSON.stringify(issue)}`)
			.join("\n");

		const prompt =
			`You just tried to finalize the "${state.currentStep}" step but validation failed. Ask the user ONE concise, friendly follow-up question (in their language) that would unblock the most important missing field. Do not list every error. Do not show JSON.

			VALIDATION ERRORS:
			${issues}
			
			EXTRACTED (FAILING) DATA:
			${JSON.stringify(state.draftStepData, null, 2)}`.trim();

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
