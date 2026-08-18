import { ChatOpenAI } from "@langchain/openai";
import type { Prisma } from "@/generated/prisma";
import { env } from "@/lib/env";
import { courseGenerationRepository } from "@/server/repositories/courseGeneration.repository";
import { wrapUntrustedContent } from "@/server/services/_shared/aiGuard/wrapUntrusted";
import {
	MODEL_MAX_RETRIES,
	MODEL_TIMEOUT_MS,
} from "@/server/services/_shared/aiLimits/modelDefaults";
import { withNodeErrors } from "@/server/services/courseAI/graph/withNodeErrors";
import { getExtractionSchemaForStep } from "@/server/services/courseAI/validators/getExtractionSchemaForStep";
import { getValidatorForStep } from "@/server/services/courseAI/validators/getValidatorForStep";

/**
 * Purpose: re-extracts a previously completed step from the revision request and persists the merge.
 * Reads: reviseTarget, content, history filtered to reviseTarget, userMessage, generationId.
 * Writes: content, assistantText.
 * Fails: propagates — both the model call and courseGenerationRepository.update are unguarded.
 */
export const revisePriorField = withNodeErrors(
	"revise_prior_field",
	async (state, config) => {
		if (!state.reviseTarget) {
			return { assistantText: "I couldn't tell which field to revise." };
		}

		const target = state.reviseTarget;
		// Use the full schema's shape for key extraction, but the relaxed schema for
		// withStructuredOutput to prevent min/max constraints leaking into LLM output.
		const fullSchema = getValidatorForStep(target);
		const extractionSchema = getExtractionSchemaForStep(target);

		const model = new ChatOpenAI({
			model: "gpt-4o-mini",
			temperature: 0,
			apiKey: env.OPENAI_API_KEY,
			timeout: MODEL_TIMEOUT_MS,
			maxRetries: MODEL_MAX_RETRIES,
		}).withStructuredOutput(extractionSchema, { method: "functionCalling" });

		// DB content is flat ({title, subtitle, sections, …}), never nested by step name.
		// Extract only the keys that belong to this step so the LLM knows what to preserve.
		const stepKeys = Object.keys(
			fullSchema.shape,
		) as (keyof typeof state.content)[];
		const currentStepData = Object.fromEntries(
			stepKeys
				.filter((k) => k in state.content)
				.map((k) => [k, state.content[k]]),
		);

		// Include the step's conversation history so the LLM can reference
		// original AI proposals when state.content is empty (no extraction yet).
		const historyForTarget = state.history
			.filter((m) => m.step === target)
			.map(
				(m) => `[${m.role}]: ${wrapUntrustedContent(m.content, "course_data")}`,
			)
			.join("\n");

		const prompt = [
			`The user wants to revise the "${target}" step of their course.`,
			historyForTarget &&
				`CONVERSATION HISTORY FOR THIS STEP:\n${historyForTarget}`,
			`CURRENT SAVED VALUES for this step:\n${JSON.stringify(currentStepData, null, 2)}`,
			`User's revision request: "${state.userMessage}"`,
			`Return the complete updated version of the "${target}" step that incorporates the user's change. Keep all existing values unless the user explicitly asked to change them.`,
		]
			.filter(Boolean)
			.join("\n\n");

		const updated = await model.invoke(
			[{ role: "user", content: prompt }],
			config,
		);

		// Content is a flat merged object — spread updated fields directly (no nesting by step key)
		const mergedContent = { ...state.content, ...updated };

		await courseGenerationRepository.update(state.generationId, {
			content: mergedContent as Prisma.JsonObject,
		});

		return { content: mergedContent, assistantText: "" };
	},
);
