import type { Prisma } from "@/generated/prisma";
import { ChatOpenAI } from "@langchain/openai";
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

		const prompt = `The user wants to revise the "${target}" step of their course.
Current values for that step: ${JSON.stringify(state.content[target] ?? {}, null, 2)}
User's revision request: "${state.userMessage}"

Return the complete updated version of the "${target}" step that incorporates the user's change. Keep all existing values unless the user explicitly asked to change them.`.trim();

		const updated = await model.invoke([{ role: "user", content: prompt }], config);

		// Content is a flat merged object — spread updated fields directly (no nesting by step key)
		const mergedContent = { ...state.content, ...updated };

		await courseGenerationRepository.update(state.generationId, {
			content: mergedContent as Prisma.JsonObject,
		});

		return { content: mergedContent, assistantText: "" };
	},
);
