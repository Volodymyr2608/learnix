import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { DraftStep } from "@/generated/prisma";
import { env } from "@/lib/env";
import { wrapUntrustedContent } from "@/server/services/_shared/aiGuard/wrapUntrusted";
import { withNodeErrors } from "@/server/services/courseAI/graph/withNodeErrors";

const outSchema = z.object({
	intent: z.enum(["continue", "revise", "clarify"]),
	reviseTarget: z
		.enum(Object.values(DraftStep) as [DraftStep, ...DraftStep[]])
		.nullable(),
	reason: z.string(),
});

/**
 * Purpose: classifies the current turn as continue / revise / clarify and names the step to revise.
 * Reads: history, userMessage, currentStep.
 * Writes: intent, reviseTarget.
 * Fails: never propagates — a model error is caught locally and falls back to intent "continue",
 * so a provider outage silently degrades routing instead of surfacing.
 */
export const classifyIntent = withNodeErrors(
	"classify_intent",
	async (state, config) => {
		// First turn or auto-trigger (empty message) cannot revise: skip the LLM call.
		if (state.history.length === 0 || !state.userMessage) {
			return { intent: "continue" as const, reviseTarget: null };
		}

		const model = new ChatOpenAI({
			model: "gpt-4o-mini",
			temperature: 0,
			apiKey: env.OPENAI_API_KEY,
		}).withStructuredOutput(outSchema, { method: "functionCalling" });

		const historyText = state.history
			.map(
				(m) =>
					`[${m.role}@${m.step}]: ${wrapUntrustedContent(m.content, "course_data")}`,
			)
			.join("\n");

		const prompt = `Classify the user's latest turn.

			CURRENT STEP: ${state.currentStep}

			CONVERSATION SO FAR:
			${historyText}

			USER'S NEW MESSAGE:
			${state.userMessage}

			Decide:
			- "continue": the user is approving, moving forward, asking a question, or providing information for the current step.
			- "revise": the user explicitly wants to add, remove, or change specific stored content — whether from an earlier step or the current step. Examples: "add a bonus section", "change the title to X", "remove requirement 3", "can you update the curriculum".
			- "clarify": you genuinely cannot tell if the user is approving/moving forward or requesting a content change. Use sparingly.

			When returning "revise", set reviseTarget to the step whose stored content should be changed (e.g., "curriculum" if the user wants to add/remove/modify sections or lessons).
			When returning "clarify", write a short friendly question in "reason" that resolves the ambiguity.

			Default to "continue" for approvals, affirmations, and questions.`.trim();

		try {
			const out = await model.invoke(
				[{ role: "user", content: prompt }],
				config,
			);
			return {
				intent: out.intent,
				reviseTarget: out.intent === "revise" ? out.reviseTarget : null,
			};
		} catch {
			return { intent: "continue" as const, reviseTarget: null };
		}
	},
);
