import { withLangGraph } from "@langchain/langgraph/zod";
import type { InteropZodType } from "@langchain/core/utils/types";
import { z } from "zod";
import { DraftStep } from "@/generated/prisma";

const draftStep = z.nativeEnum(DraftStep);

const historyEntry = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  step: draftStep,
});

export const CourseBuilderState = z.object({
  // hydrated at request start
  generationId: z.string(),
  instructorId: z.string(),
  currentStep: draftStep,
  content: z.record(z.string(), z.unknown()).default(() => ({})),
  history: z.array(historyEntry).default(() => []),
  mode: z.enum(["chat", "finalize"]),

  // current turn — set by route handler
  userMessage: z.string().default(""),

  // produced by nodes
  intent: z.enum(["continue", "revise"]).nullable().default(null),
  reviseTarget: draftStep.nullable().default(null),
  toolCalls: withLangGraph(
    z.array(z.unknown()).default(() => []) as unknown as InteropZodType<
      unknown[]
    >,
    {
      reducer: {
        fn: (prev: unknown[], next: unknown | unknown[]) =>
          prev.concat(Array.isArray(next) ? next : [next]),
        schema: z.union([
          z.unknown(),
          z.array(z.unknown()),
        ]) as unknown as InteropZodType<unknown | unknown[]>,
      },
    },
  ),
  assessReady: z.boolean().default(false),
  draftStepData: z.unknown().default(undefined),
  confidence: z.number().min(0).max(1).default(0),
  shouldAutoAdvance: z.boolean().default(false),
  assistantText: withLangGraph(
    z.string().default("") as unknown as InteropZodType<string>,
    {
      reducer: {
        fn: (prev: string, next: string) => prev + next,
        schema: z.string() as unknown as InteropZodType<string>,
      },
    },
  ),
  validationErrors: z.array(z.unknown()).nullable().default(null),
});

export type CourseBuilderStateT = z.infer<typeof CourseBuilderState>;