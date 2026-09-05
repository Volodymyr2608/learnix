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

/**
 * Exported so the eval measures the cut point the product actually uses. A
 * copied literal in `confidenceScore.eval.ts` would keep reporting the old one
 * if this ever moved — green while measuring something the graph no longer does.
 */
export const CONFIDENCE_THRESHOLD = 0.8;

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
				(m) =>
					`[${m.role}]: ${wrapUntrustedContent(
						m.content,
						m.role === "assistant" ? "model_output" : "course_data",
					)}`,
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
			- Score the EXTRACTED DATA, not the conversation. A short exchange that produced substantive data scores high; a long one that produced thin data does not.
			- A field that is filled is not a field that is finished. Ask of each value: could an instructor act on it, and would two instructors reading it build the same thing?
			- A populated field scores low when its value is a placeholder: a list holding a single entry where the step expects a set, or a title made of the unit's own name plus its position.
			- An objective or requirement must say what the learner will be able to DO. One that only names a topic or a technology — a verb plus a broad noun, with nothing about the skill — is a placeholder however few or many words it uses. This test is for objectives and requirements only: a lesson title names a topic by design, and a short one is not a defect.
			- 0.9–1.0: every value is specific and substantive, and together they cover the step.
			- 0.8–0.9: complete and usable, with minor room to improve.
			- 0.5–0.75: real content, but thin — a lone entry where a set belongs, or values that name a topic without narrowing it.
			- 0.2–0.5: key fields missing, or values that restate the field's own name.
			- 0.0–0.2: empty, or filled with the schema's vocabulary.
			- Use the whole range. Two drafts of visibly different quality must not receive the same score.`.trim();

		const out = await model.invoke([{ role: "user", content: prompt }], config);
		const score = out.score;
		const shouldAutoAdvance =
			score >= CONFIDENCE_THRESHOLD && state.validationErrors === null;

		return { confidence: score, shouldAutoAdvance };
	},
);
