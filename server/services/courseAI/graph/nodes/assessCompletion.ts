import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { env } from "@/lib/env";
import { withNodeErrors } from "@/server/services/courseAI/graph/withNodeErrors";

const outSchema = z.object({
	decision: z.enum(["ready", "not_ready", "ask"]),
	// Only set when decision === "ask": a short friendly question to resolve ambiguity.
	question: z.string().optional(),
});

export const assessCompletion = withNodeErrors(
	"assess_completion",
	async (state, config) => {
		// Auto-trigger, revision, and clarify turns must never commit.
		if (
			!state.userMessage ||
			state.intent === "revise" ||
			state.intent === "clarify"
		)
			return { assessReady: false, assessClarify: null };

		const model = new ChatOpenAI({
			model: "gpt-4o-mini",
			temperature: 0,
			apiKey: env.OPENAI_API_KEY,
		}).withStructuredOutput(outSchema, { method: "functionCalling" });

		const historyText = [
			...state.history.filter((m) => m.step === state.currentStep),
			{
				role: "user" as const,
				content: state.userMessage,
				step: state.currentStep,
			},
			{
				role: "assistant" as const,
				content: state.assistantText,
				step: state.currentStep,
			},
		]
			.map((m) => `[${m.role}]: ${m.content}`)
			.join("\n");

		const prompt =
			`Decide how to handle the user's latest message for the "${state.currentStep}" step.

			Return one of three decisions:

			"ready" — the user clearly wants to proceed (approve, finalize, move on). This includes approvals with typos, informal phrasing, expressions of liking ("I like it", "so i like it"), finalization requests ("can you finalize", "let's commit"), or any short message that expresses satisfaction or a desire to continue.

			"not_ready" — the user clearly wants to make a change or provide more information before proceeding (change request, adding/removing items, asking a non-finalization question, etc.).

			"ask" — the message is genuinely ambiguous and you cannot reliably infer intent. Use this sparingly. When you choose "ask", set "question" to a short, friendly clarifying question in the same language as the user that resolves the ambiguity (e.g., "Everything looks good — shall I finalize this step and move on?").

			Default to "ready" for short messages that express satisfaction or a wish to continue, even if phrased informally or with typos.

			CONVERSATION:
			${historyText}`.trim();

		try {
			const out = await model.invoke(
				[{ role: "user", content: prompt }],
				config,
			);
			return {
				assessReady: out.decision === "ready",
				assessClarify:
					out.decision === "ask"
						? (out.question ?? "Everything looks good — shall I finalize this step?")
						: null,
			};
		} catch {
			return { assessReady: false, assessClarify: null };
		}
	},
);