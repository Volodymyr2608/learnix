import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { env } from "@/lib/env";
import { wrapUntrustedContent } from "@/server/services/_shared/aiGuard/wrapUntrusted";
import {
	MODEL_MAX_RETRIES,
	MODEL_TIMEOUT_MS,
} from "@/server/services/_shared/aiLimits/modelDefaults";
import type { CourseBuilderStateT } from "@/server/services/courseAI/graph/state";
import { withNodeErrors } from "@/server/services/courseAI/graph/withNodeErrors";

const CONFIDENCE_THRESHOLD = 0.8;

const outSchema = z.object({
	score: z.number().min(0).max(1),
	rationale: z.string(),
});

/**
 * Purpose: scores step completeness 0..1 and sets shouldAutoAdvance against the 0.8 threshold.
 * Reads: draftStepData, history filtered to currentStep (ADR-016 — unfiltered history suppresses
 * the score below the threshold), userMessage, assistantText, currentStep, validationErrors.
 * Writes: confidence, shouldAutoAdvance.
 * Fails: propagates — unlike classify_intent and assess_completion, this node has no local fallback.
 */
export const confidenceScore = withNodeErrors(
	"confidence_score",
	async (state: CourseBuilderStateT, config) => {
		const model = new ChatOpenAI({
			model: "gpt-4o-mini",
			temperature: 0,
			apiKey: env.OPENAI_API_KEY,
			timeout: MODEL_TIMEOUT_MS,
			maxRetries: MODEL_MAX_RETRIES,
		}).withStructuredOutput(outSchema, { method: "functionCalling" });

		const historyText = state.history
			.filter((m) => m.step === state.currentStep)
			.map(
				(m) => `[${m.role}]: ${wrapUntrustedContent(m.content, "course_data")}`,
			)
			.join("\n");

		const prompt =
			`Rate your confidence (0..1) that the "${state.currentStep}" step is complete and correct.

			EXTRACTED DATA (primary basis for scoring):
			${wrapUntrustedContent(JSON.stringify(state.draftStepData, null, 2), "model_output")}

			CONVERSATION CONTEXT:
			${historyText}
			[user]: ${state.userMessage}
			${state.assistantText ? `[assistant]: ${wrapUntrustedContent(state.assistantText, "model_output")}` : ""}

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
