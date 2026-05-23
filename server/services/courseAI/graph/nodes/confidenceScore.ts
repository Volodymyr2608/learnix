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

CONVERSATION:
${state.history.map((m) => `[${m.role}]: ${m.content}`).join("\n")}
[user]: ${state.userMessage}
${state.assistantText ? `[assistant]: ${state.assistantText}` : ""}

EXTRACTED DATA:
${JSON.stringify(state.draftStepData, null, 2)}

Guidelines:
- 0.9–1.0: ship.
- 0.7–0.9: solid but could improve.
- 0.4–0.7: gaps remain.
- 0.0–0.4: clearly underspecified.`.trim();

		const out = await model.invoke([{ role: "user", content: prompt }], config);
		const score = out.score;
		const shouldAutoAdvance =
			score >= CONFIDENCE_THRESHOLD && state.validationErrors === null;

		return { confidence: score, shouldAutoAdvance };
	},
);
