import { ChatOpenAI } from "@langchain/openai";
import { env } from "@/lib/env";
import { withNodeErrors } from "@/server/services/courseAI/graph/withNodeErrors";
import {
	autoTransitionPrompt,
	clarifyIntentPrompt,
	reviseConfirmPrompt,
} from "@/server/services/courseAI/prompts/chatResponsePrompts";
import { buildSystemPrompt } from "@/server/services/courseAI/prompts/systemPrompt";

/**
 * Purpose: streams the assistant reply, choosing between the auto-transition, revise-confirm,
 * clarify and normal prompt branches.
 * Reads: userMessage, currentStep, content, intent, history.
 * Writes: assistantText (append reducer).
 * Fails: propagates — model.stream is unguarded; a mid-stream drop loses the partial reply.
 *
 * Deliberately does NOT read `state.messages`. That channel holds tool results,
 * and search_similar_courses deposits other instructors' titles and subtitles
 * into it — cross-tenant copy. tool_router reads it to choose tools; this node
 * streams straight to the instructor, so pulling it in here would put another
 * tenant's text into a reply. Pinned by chatResponse.containment.contract.test.ts.
 */
export const chatResponse = withNodeErrors(
	"chat_response",
	async (state, config) => {
		const model = new ChatOpenAI({
			model: "gpt-4o-mini",
			temperature: 0.4,
			apiKey: env.OPENAI_API_KEY,
			streaming: true,
		});

		let messages: Array<{
			role: "system" | "user" | "assistant";
			content: string;
		}>;

		if (!state.userMessage) {
			// Auto-transition: previous step was just committed automatically.
			// Start fresh — no history so the AI doesn't react to unanswered questions.
			messages = [
				{
					role: "system",
					content: autoTransitionPrompt({
						step: state.currentStep,
						courseData: state.content,
					}),
				},
				{
					role: "user" as const,
					content: `Start the ${state.currentStep} step.`,
				},
			];
		} else if (state.intent === "revise") {
			// Revision was applied — confirm the change and invite the user to proceed.
			messages = [
				{
					role: "system" as const,
					content: reviseConfirmPrompt(),
				},
				{ role: "user" as const, content: state.userMessage },
			];
		} else if (state.intent === "clarify") {
			// Intent was ambiguous — ask one focused question to resolve it.
			messages = [
				{
					role: "system",
					content: clarifyIntentPrompt({ step: state.currentStep }),
				},
				...state.history
					.slice(-4)
					.map((m) => ({ role: m.role, content: m.content })),
				{ role: "user" as const, content: state.userMessage },
			];
		} else {
			const systemPrompt = buildSystemPrompt({
				step: state.currentStep,
				currentCourseData: state.content as Record<string, unknown>,
			});

			messages = [
				{ role: "system" as const, content: systemPrompt },
				...state.history.map((m) => ({ role: m.role, content: m.content })),
				{ role: "user" as const, content: state.userMessage },
			];
		}

		const stream = await model.stream(messages, config);

		let text = "";
		for await (const chunk of stream) {
			const token = chunk.content?.toString();
			if (token) text += token;
		}

		return { assistantText: text };
	},
);
