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

			"not_ready" — the user clearly wants to make a change, provide more information, or is still discussing before proceeding (change request, adding/removing items, asking a non-finalization question, OR simply providing the topic/initial details while the assistant has just proposed a draft). This is the default when the user has not explicitly signaled they want to proceed.

			"ask" — RARE. Only when the user's message looks like it could be an approval ("ok", "sure", "fine") but is genuinely ambiguous about whether they mean "proceed/finalize" vs. "ok, but I have more to say". Do NOT use "ask" when the user is just providing content or the conversation has only just started — that is "not_ready". When you do choose "ask", set "question" to a short, friendly clarifying question, written in the same language as the user's latest message (the last [user] entry below).

			Default to "not_ready" when in doubt. Only return "ready" for messages that clearly express satisfaction or an explicit wish to continue, and only return "ask" in the narrow approval-ambiguity case above.

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
						? (out.question ??
							"Everything looks good — shall I finalize this step?")
						: null,
			};
		} catch {
			return { assessReady: false, assessClarify: null };
		}
	},
);
