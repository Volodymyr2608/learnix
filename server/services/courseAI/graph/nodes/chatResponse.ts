import { ChatOpenAI } from "@langchain/openai";
import { env } from "@/lib/env";
import { withNodeErrors } from "@/server/services/courseAI/graph/withNodeErrors";
import { buildSystemPrompt } from "@/server/services/courseAI/prompts/systemPrompt";
import { STEP_PROMPTS } from "@/server/services/courseAI/prompts/stepPrompts";

export const chatResponse = withNodeErrors("chat_response", async (state, config) => {
	const model = new ChatOpenAI({
		model: "gpt-4o-mini",
		temperature: 0.4,
		apiKey: env.OPENAI_API_KEY,
		streaming: true,
	});

	let messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;

	if (!state.userMessage) {
		// Auto-transition: previous step was just committed automatically.
		// Start fresh — no history so the AI doesn't react to unanswered questions.
		messages = [
			{
				role: "system",
				content: `You are a professional educational consultant helping a teacher build a course.
The previous step was just automatically completed. Now start the "${state.currentStep}" step.

Course data collected so far:
${JSON.stringify(state.content, null, 2)}

YOUR TASK FOR THE "${state.currentStep.toUpperCase()}" STEP:
${STEP_PROMPTS[state.currentStep]}

Instructions:
- Write 1-2 friendly sentences transitioning to this step
- Immediately provide concrete draft suggestions based on the course data above
- Do NOT reference any previous messages or ask if the user is ready to proceed
- Speak the same language as the course title/data
- Do NOT show raw JSON`.trim(),
			},
			{ role: "user" as const, content: `Start the ${state.currentStep} step.` },
		];
	} else if (state.intent === "revise") {
		// Revision was applied — stream a brief confirmation of what changed.
		messages = [
			{
				role: "system" as const,
				content: `You are helping an instructor build a course. They just revised an earlier step.

Updated "${state.reviseTarget}" step data:
${JSON.stringify(state.content[state.reviseTarget ?? ""] ?? {}, null, 2)}

Write 1-2 friendly sentences confirming what was updated. Do not ask questions. Do not mention the next step. Speak the same language as the course data.`.trim(),
			},
			{ role: "user" as const, content: state.userMessage },
		];
	} else if (state.intent === "clarify") {
		// Intent was ambiguous — ask one focused question to resolve it.
		messages = [
			{
				role: "system",
				content: `You are a helpful assistant guiding an instructor through course creation.
The instructor's last message was ambiguous — it could mean they want to continue with the current "${state.currentStep}" step, or revise a value from an earlier step.

Ask ONE short, friendly question to clarify their intent. Reference the specific step and field that might be affected (e.g. "Did you mean to update the level from the Basic Info step, or are you providing more detail for the current ${state.currentStep} step?").
Speak the same language as the user. Do not ask multiple questions.`.trim(),
			},
			...state.history.slice(-4).map((m) => ({ role: m.role, content: m.content })),
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
});
