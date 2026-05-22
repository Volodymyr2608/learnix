import { ChatOpenAI } from "@langchain/openai";
import { env } from "@/lib/env";
import { buildSystemPrompt } from "@/server/services/courseAI/prompts/systemPrompt";
import { withNodeErrors } from "@/server/services/courseAI/graph/withNodeErrors";
import type { CourseBuilderStateT } from "@/server/services/courseAI/graph/state";

export const chatResponse = withNodeErrors("chat_response", async (state) => {
  const model = new ChatOpenAI({
    model: "gpt-4o-mini",
    temperature: 0.4,
    apiKey: env.OPENAI_API_KEY,
    streaming: true,
  });

  const systemPrompt = buildSystemPrompt({
    step: state.currentStep,
    currentCourseData: state.content as Record<string, unknown>,
  });

  const messages = [
    { role: "system" as const, content: systemPrompt },
    ...state.history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: state.userMessage },
  ];

  const stream = await model.stream(messages);

  let text = "";
  for await (const chunk of stream) {
    const token = chunk.content?.toString();
    if (token) text += token;
  }

  return { assistantText: text };
});