import { ChatOpenAI } from "@langchain/openai";
import { env } from "@/lib/env";
import { withNodeErrors } from "@/server/services/courseAI/graph/withNodeErrors";
import { buildSystemPrompt } from "@/server/services/courseAI/prompts/systemPrompt";
import { STEP_PROMPTS } from "@/server/services/courseAI/prompts/stepPrompts";

export const chatResponse = withNodeErrors("chat_response", async (state) => {
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

	const stream = await model.stream(messages);

	let text = "";
	for await (const chunk of stream) {
		const token = chunk.content?.toString();
		if (token) text += token;
	}

	return { assistantText: text };
});
