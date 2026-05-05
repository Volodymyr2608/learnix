# Spec: AI Quiz Generator

## Status: planned — Phase 9

## Problem

Instructors currently have to write quiz questions by hand. The `Quiz` model, repository, and Zod DTOs already exist but there is no UI, no tRPC procedures, and no quiz submission flow yet. This is the first feature to introduce a proper LangChain agent + tools + LCEL chain — not a raw API call.

## Goal

An instructor clicks "Generate Quiz" on a lesson editor page. An agent reads the lesson content and existing questions, then generates 3–5 new multiple-choice questions. The instructor reviews, edits, and saves. Students then see and submit the quiz when studying that lesson.

---

## Prerequisites (non-AI groundwork, ~1 day)

Wire up the quiz infrastructure that already exists in the DB:

1. **tRPC procedures** (`server/api/routers/quiz.ts`):
   - `quiz.getByLesson(lessonId)` — enrolled students
   - `quiz.submit(quizId, selectedAnswer)` — student, persists `QuizAttempt`
   - `quiz.upsertMany(lessonId, questions[])` — instructor, replaces quiz set
   - `quiz.deleteByLesson(lessonId)` — instructor

2. **Quiz UI in lesson viewer** (`app/dashboard/courses/[courseId]/learn/page.tsx`):
   - Show questions after video/content
   - Submit answer → mark correct/incorrect
   - Block re-submission if already attempted (configurable)

3. **Quiz UI in lesson editor** (`app/instructor/courses/[courseId]/lessons/[lessonId]/page.tsx`):
   - List, add, edit, delete questions manually
   - "Generate with AI" button (this spec)

---

## LangChain design

### Output schema

```ts
// server/services/quizAI/schemas/quizOutput.schema.ts
import { z } from "zod";

export const QuizQuestionSchema = z.object({
  question: z.string(),
  options: z.array(z.string()).length(4),
  correct: z.string(),
});

export const QuizOutputSchema = z.object({
  questions: z.array(QuizQuestionSchema).min(3).max(5),
});

export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;
```

---

### Tools

The agent has two tools. Both are read-only — they gather context before generating.

```ts
// server/services/quizAI/tools/getLessonContent.tool.ts
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { lessonRepository } from "@/server/repositories/lesson.repository";

export const getLessonContentTool = tool(
  async ({ lessonId }) => {
    const lesson = await lessonRepository.findOne(lessonId);
    if (!lesson?.content) return "No text content found for this lesson.";
    return `Title: ${lesson.title}\n\n${lesson.content}`;
  },
  {
    name: "get_lesson_content",
    description:
      "Returns the full text content of the lesson. Always call this first before generating questions.",
    schema: z.object({
      lessonId: z.string().describe("The lesson ID to load content for"),
    }),
  },
);
```

```ts
// server/services/quizAI/tools/getExistingQuizzes.tool.ts
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { quizRepository } from "@/server/repositories/quiz.repository";

export const getExistingQuizziesTool = tool(
  async ({ lessonId }) => {
    const existing = await quizRepository.findMany({ where: { lessonId } });
    if (!existing.length) return "No existing questions for this lesson.";
    return existing.map((q) => `- ${q.question}`).join("\n");
  },
  {
    name: "get_existing_quizzes",
    description:
      "Returns existing quiz questions for the lesson. Call this to avoid generating duplicates.",
    schema: z.object({
      lessonId: z.string(),
    }),
  },
);
```

---

### Agent

```ts
// server/services/quizAI/quizAI.agent.ts
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { getLessonContentTool } from "./tools/getLessonContent.tool";
import { getExistingQuizziesTool } from "./tools/getExistingQuizzes.tool";
import { QuizOutputSchema } from "./schemas/quizOutput.schema";

const QUIZ_SYSTEM_PROMPT = `You are an expert quiz designer for online courses.

Your task:
1. Call get_lesson_content to read the lesson material.
2. Call get_existing_quizzes to see what questions already exist.
3. Generate {count} NEW multiple-choice questions that:
   - Test understanding, not just memorisation
   - Are appropriate for a {level} audience
   - Do not duplicate existing questions
   - Have exactly 4 options each
   - Have the correct answer be one of the 4 options

Return only the questions — no explanation.`;

export function createQuizAgent(lessonId: string, level: string, count: number) {
  const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0.3 });

  const structuredLlm = llm.withStructuredOutput(QuizOutputSchema);

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", QUIZ_SYSTEM_PROMPT],
    ["placeholder", "{messages}"],
  ]);

  return createReactAgent({
    llm: structuredLlm,
    tools: [getLessonContentTool, getExistingQuizziesTool],
    prompt,
  });
}
```

---

### LCEL chain (orchestrator + retry)

The chain wraps the agent with semantic validation and retry feedback. If the agent
returns a question where `correct` is not in `options`, the error is fed back and the
agent retries — up to 3 times.

```ts
// server/services/quizAI/quizAI.service.ts
import { RunnableSequence } from "@langchain/core/runnables";
import { HumanMessage } from "@langchain/core/messages";
import { createQuizAgent } from "./quizAI.agent";
import type { QuizQuestion } from "./schemas/quizOutput.schema";
import { QuizAIError } from "./quizAI.errors";
import { logger } from "@/server/utils/logger";

export class QuizAIService {
  async generateForLesson(
    lessonId: string,
    level: string,
    count = 5,
  ): Promise<QuizQuestion[]> {
    const chain = RunnableSequence.from([
      // Step 1: package inputs for the agent
      (input: { lessonId: string; count: number; level: string }) =>
        ({
          messages: [
            new HumanMessage(
              `Generate ${input.count} quiz questions for lesson ID: ${input.lessonId}`,
            ),
          ],
          lessonId: input.lessonId,
          count: input.count,
          level: input.level,
        }) as const,

      // Step 2: run the ReAct agent
      createQuizAgent(lessonId, level, count),

      // Step 3: extract the structured output
      (agentOutput) => agentOutput.structuredOutput?.questions ?? [],
    ]);

    return this.runWithRetry(chain, { lessonId, count, level }, 3);
  }

  private async runWithRetry(
    chain: RunnableSequence,
    input: { lessonId: string; count: number; level: string },
    maxAttempts: number,
  ): Promise<QuizQuestion[]> {
    let lastError: string | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const attemptInput =
        lastError
          ? { ...input, hint: `Previous attempt failed: ${lastError}. Fix it.` }
          : input;

      const questions: QuizQuestion[] = await chain.invoke(attemptInput);
      const error = this.validateSemantics(questions);

      if (!error) return questions;

      lastError = error;
      logger.warn(`Quiz generation attempt ${attempt}/${maxAttempts} failed: ${error}`);
    }

    throw new QuizAIError(`Failed to generate valid quiz after ${maxAttempts} attempts`);
  }

  private validateSemantics(questions: QuizQuestion[]): string | null {
    for (const q of questions) {
      if (!q.options.includes(q.correct)) {
        return `Question "${q.question}" has correct="${q.correct}" which is not in options`;
      }
    }
    return null;
  }
}

export const quizAIService = new QuizAIService();
```

---

### tRPC procedure

```ts
// instructorProcedure — in server/api/routers/quiz.ts
generateAI: instructorProcedure
  .input(z.object({ lessonId: z.string(), count: z.number().min(3).max(5).default(5) }))
  .mutation(async ({ input, ctx }) => {
    const lesson = await lessonRepository.findOne(input.lessonId);
    if (!lesson) throw new TRPCError({ code: "NOT_FOUND" });

    return quizAIService.generateForLesson(
      input.lessonId,
      lesson.section.course.level,
      input.count,
    );
    // Returns QuizQuestion[] — instructor reviews then calls quiz.upsertMany to save
  });
```

Two-step UX: generate → review → save. The instructor is always in control.

---

## Data flow summary

```
instructor clicks "Generate Quiz"
  │
  ▼
tRPC: quiz.generateAI(lessonId, count)
  │
  ▼
QuizAIService.generateForLesson()
  │
  ▼
RunnableSequence (LCEL chain)
  ├─ Step 1: package inputs
  ├─ Step 2: ReAct Agent
  │    ├─ think: "I need lesson content"
  │    ├─ call: get_lesson_content(lessonId)  → lesson text
  │    ├─ think: "Check for duplicates"
  │    ├─ call: get_existing_quizzes(lessonId) → existing questions
  │    └─ output: { questions: QuizQuestion[] }  ← withStructuredOutput
  └─ Step 3: extract questions array
  │
  ▼
validateSemantics() → pass or retry (up to 3x)
  │
  ▼
QuizQuestion[] returned to instructor UI
  │
  ▼
instructor reviews in dialog → calls quiz.upsertMany(lessonId, questions)
```

---

## UI flow

```
Lesson editor
  └── [Generate Quiz with AI] button
        │
        ▼ (loading spinner ~4s)
        │
        ▼
  Preview dialog
  ┌─────────────────────────────────────────┐
  │  Q1: What is the purpose of X?          │
  │    ○ Answer A                           │
  │    ● Answer B  ← correct               │
  │    ○ Answer C                           │
  │    ○ Answer D                           │
  │  [Edit]                                 │
  │                                         │
  │  Q2: ...                                │
  │                                         │
  │  [Regenerate]    [Save all questions]   │
  └─────────────────────────────────────────┘
```

---

## Files to create / modify

| Action | Path |
|---|---|
| New schema | `server/services/quizAI/schemas/quizOutput.schema.ts` |
| New tool | `server/services/quizAI/tools/getLessonContent.tool.ts` |
| New tool | `server/services/quizAI/tools/getExistingQuizzes.tool.ts` |
| New agent | `server/services/quizAI/quizAI.agent.ts` |
| New service | `server/services/quizAI/quizAI.service.ts` |
| New errors | `server/services/quizAI/quizAI.errors.ts` |
| New router | `server/api/routers/quiz.ts` |
| Modify | `server/api/root.ts` — add quiz router |
| Modify | `app/instructor/courses/[courseId]/lessons/[lessonId]/page.tsx` |
| Modify | `app/dashboard/courses/[courseId]/learn/page.tsx` |

---

## Estimated effort

| Task | Time |
|---|---|
| tRPC quiz procedures + service stub | 2–3 h |
| Quiz UI (lesson viewer) | 3–4 h |
| Quiz UI (lesson editor, manual) | 2–3 h |
| Tools + agent + LCEL chain | 3–4 h |
| Retry + semantic validation | 1 h |
| Generate dialog UI | 2–3 h |
| **Total** | **~2–2.5 days** |
