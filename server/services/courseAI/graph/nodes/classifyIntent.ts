import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { DraftStep } from "@/generated/prisma";
import { env } from "@/lib/env";
import { withNodeErrors } from "@/server/services/courseAI/graph/withNodeErrors";
import type { CourseBuilderStateT } from "@/server/services/courseAI/graph/state";

const outSchema = z.object({
  intent: z.enum(["continue", "revise"]),
  reviseTarget: z.nativeEnum(DraftStep).nullable(),
  reason: z.string(),
});

export const classifyIntent = withNodeErrors(
  "classify_intent",
  async (state) => {
    // First turn cannot revise: skip the LLM call.
    if (state.history.length === 0) {
      return { intent: "continue" as const, reviseTarget: null };
    }

    const model = new ChatOpenAI({
      model: "gpt-4o-mini",
      temperature: 0,
      apiKey: env.OPENAI_API_KEY,
    }).withStructuredOutput(outSchema);

    const historyText = state.history
      .map((m) => `[${m.role}@${m.step}]: ${m.content}`)
      .join("\n");

    const prompt = `Classify the user's latest turn.

CURRENT STEP: ${state.currentStep}

CONVERSATION SO FAR:
${historyText}

USER'S NEW MESSAGE:
${state.userMessage}

Decide:
- "continue": the user is moving forward / answering for the current step.
- "revise": the user wants to change a value they already provided in an earlier step.

If unsure, default to "continue".`.trim();

    try {
      const out = await model.invoke([{ role: "user", content: prompt }]);
      return {
        intent: out.intent,
        reviseTarget: out.intent === "revise" ? out.reviseTarget : null,
      };
    } catch {
      return { intent: "continue" as const, reviseTarget: null };
    }
  },
);