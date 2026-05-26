import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { env } from "@/lib/env";
import type { CourseBuilderStateT } from "@/server/services/courseAI/graph/state";
import { withNodeErrors } from "@/server/services/courseAI/graph/withNodeErrors";

const CONFIDENCE_THRESHOLD = 0.8;

const outSchema = z.object({
	score: z.number().min(0).max(1),
	rationale: z.string(),
});

export const confidenceScore = withNodeErrors(
	"confidence_score",
	async (state: CourseBuilderStateT, config) => {
		const model = new ChatOpenAI({
			model: "gpt-4o-mini",
			temperature: 0,
			apiKey: env.OPENAI_API_KEY,
		}).withStructuredOutput(outSchema, { method: "functionCalling" });

		const prompt =
			`Rate your confidence (0..1) that the "${state.currentStep}" step is complete and correct.

			EXTRACTED DATA (primary basis for scoring):
			${JSON.stringify(state.draftStepData, null, 2)}

			CONVERSATION CONTEXT:
			${state.history
				.filter((m) => m.step === state.currentStep)
				.map((m) => `[${m.role}]: ${m.content}`)
				.join("\n")}
			[user]: ${state.userMessage}
			${state.assistantText ? `[assistant]: ${state.assistantText}` : ""}

			Guidelines:
			- Base your score PRIMARILY on the EXTRACTED DATA quality and completeness.
			- If EXTRACTED DATA has all required fields and the content is specific (not empty strings or placeholders), score at least 0.85.
			- 0.9–1.0: All required fields present, content is rich and specific.
			- 0.7–0.9: Data present but could improve (generic titles, few lessons, etc.).
			- 0.4–0.7: Key fields missing or very sparse.
			- 0.0–0.4: Clearly underspecified or empty.
			- A brief conversation is not a reason to score low — judge the DATA, not the chat length.`.trim();

		const out = await model.invoke([{ role: "user", content: prompt }], config);
		const score = out.score;
		const shouldAutoAdvance =
			score >= CONFIDENCE_THRESHOLD && state.validationErrors === null;

		return { confidence: score, shouldAutoAdvance };
	},
);
