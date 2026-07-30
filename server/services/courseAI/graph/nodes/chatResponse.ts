import { ChatOpenAI } from "@langchain/openai";
import { env } from "@/lib/env";
import { UNTRUSTED_DATA_CLAUSE } from "@/server/services/_shared/aiGuard/messages";
import { wrapUntrustedContent } from "@/server/services/_shared/aiGuard/wrapUntrusted";
import { withNodeErrors } from "@/server/services/courseAI/graph/withNodeErrors";
import { STEP_PROMPTS } from "@/server/services/courseAI/prompts/stepPrompts";
import { buildSystemPrompt } from "@/server/services/courseAI/prompts/systemPrompt";

/**
 * Purpose: streams the assistant reply, choosing between the auto-transition, revise-confirm,
 * clarify and normal prompt branches.
 * Reads: userMessage, currentStep, content, intent, history.
 * Writes: assistantText (append reducer).
 * Fails: propagates — model.stream is unguarded; a mid-stream drop loses the partial reply.
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
					content:
						`You are a professional educational consultant helping a teacher build a course.
The previous step was just automatically completed. Now start the "${state.currentStep}" step.

Course data collected so far:
${wrapUntrustedContent(JSON.stringify(state.content, null, 2), "course_data")}

${UNTRUSTED_DATA_CLAUSE}

YOUR TASK FOR THE "${state.currentStep.toUpperCase()}" STEP:
${STEP_PROMPTS[state.currentStep]}

Instructions:
- Write 1-2 friendly sentences transitioning to this step
- Immediately provide concrete draft suggestions based on the course data above
- Do NOT reference any previous messages or ask if the user is ready to proceed
- Respond in the same language the instructor is writing in. Never add translations or repeat content in multiple languages. The "language" field in the data is the course content language, not your response language
- Do NOT show raw JSON`.trim(),
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
					content:
						`You are helping an instructor build a course. The instructor just requested a change.

Write 1-2 friendly sentences confirming the change was applied and briefly describing what was updated. Then ask if everything looks good. Respond in the same language the instructor wrote in. Never add translations.`.trim(),
				},
				{ role: "user" as const, content: state.userMessage },
			];
		} else if (state.intent === "clarify") {
			// Intent was ambiguous — ask one focused question to resolve it.
			messages = [
				{
					role: "system",
					content:
						`You are a helpful assistant guiding an instructor through course creation.
The instructor's last message was ambiguous — it could mean they want to continue with the current "${state.currentStep}" step, or revise a value from an earlier step.

Ask ONE short, friendly question to clarify their intent. Reference the specific step and field that might be affected (e.g. "Did you mean to update the level from the Basic Info step, or are you providing more detail for the current ${state.currentStep} step?").
Respond in the same language the user is writing in. Never add translations. Do not ask multiple questions.`.trim(),
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
