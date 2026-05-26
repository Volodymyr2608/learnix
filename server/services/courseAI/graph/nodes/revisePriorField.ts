import { ChatOpenAI } from "@langchain/openai";
import type { Prisma } from "@/generated/prisma";
import { env } from "@/lib/env";
import { courseGenerationRepository } from "@/server/repositories/courseGeneration.repository";
import { withNodeErrors } from "@/server/services/courseAI/graph/withNodeErrors";
import { getValidatorForStep } from "@/server/services/courseAI/validators/getValidatorForStep";

export const revisePriorField = withNodeErrors(
	"revise_prior_field",
	async (state, config) => {
		if (!state.reviseTarget) {
			return { assistantText: "I couldn't tell which field to revise." };
		}

		const target = state.reviseTarget;
		const schema = getValidatorForStep(target);

		const model = new ChatOpenAI({
			model: "gpt-4o-mini",
			temperature: 0,
			apiKey: env.OPENAI_API_KEY,
		}).withStructuredOutput(schema, { method: "functionCalling" });

		// DB content is flat ({title, subtitle, sections, …}), never nested by step name.
		// Extract only the keys that belong to this step so the LLM knows what to preserve.
		const stepKeys = Object.keys(schema.shape) as (keyof typeof state.content)[];
		const currentStepData = Object.fromEntries(
			stepKeys
				.filter((k) => k in state.content)
				.map((k) => [k, state.content[k]]),
		);

		const prompt =
			`The user wants to revise the "${target}" step of their course.
Current values for that step: ${JSON.stringify(currentStepData, null, 2)}
User's revision request: "${state.userMessage}"

Return the complete updated version of the "${target}" step that incorporates the user's change. Keep all existing values unless the user explicitly asked to change them.`.trim();

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
