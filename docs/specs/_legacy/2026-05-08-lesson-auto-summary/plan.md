# Plan: Lesson Auto-Summary & Study Guide

## Implementation order

1. Schema + migration + repository.
2. Three sub-chains + their Zod output schemas.
3. `RunnableParallel` composition with retry.
4. Service (cache check + persist).
5. tRPC procedures.
6. UI: instructor button + student card.

---

## Step 1 — Schema

```prisma
// prisma/schema/lesson.prisma — append

model LessonInsights {
  id          String   @id @default(cuid())
  lessonId    String   @unique
  summary     String   @db.Text
  concepts    Json
  glossary    Json
  model       String
  contentHash String
  generatedAt DateTime @default(now())

  lesson      Lesson   @relation(fields: [lessonId], references: [id], onDelete: Cascade)

  @@index([lessonId])
}
```

Add `lessonInsights LessonInsights?` back-relation on `Lesson`.

The repository extends `BaseRepository` (ADR-003). One method beyond the standard CRUD: `findByLessonId(lessonId)`.

---

## Step 2 — Sub-chains

All three sub-chains share the same pattern: `prompt | model.withStructuredOutput(schema)`. They differ only in prompt and schema.

```ts
// server/services/lessonInsightsAI/schemas/lessonInsights.schema.ts
import { z } from "zod";

export const SummarySchema = z.object({
  summary: z.string().min(40).max(800),
});

export const ConceptsSchema = z.object({
  concepts: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        explanation: z.string().min(10).max(300),
      }),
    )
    .min(3)
    .max(7),
});

export const GlossarySchema = z.object({
  glossary: z
    .array(
      z.object({
        term: z.string().min(1).max(60),
        definition: z.string().min(10).max(300),
      }),
    )
    .min(0)
    .max(15),
});
```

```ts
// server/services/lessonInsightsAI/chains/summary.chain.ts
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { SummarySchema } from "../schemas/lessonInsights.schema";

const prompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are a study-guide editor. Given the full text of a lesson, write a single concise paragraph (60–150 words) that captures the lesson's purpose, main argument or technique, and the practical takeaway. No bullet points, no headers.`,
  ],
  ["human", "{content}"],
]);

const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0.2 })
  .withStructuredOutput(SummarySchema);

export const summaryChain = prompt.pipe(llm);
```

`concepts.chain.ts` and `glossary.chain.ts` follow the same shape with their respective schemas and prompts. Concepts asks for 3–7 named ideas with one-sentence explanations; glossary asks for term/definition pairs (zero results allowed when the lesson has no jargon).

---

## Step 3 — Parallel composition + retry

```ts
// server/services/lessonInsightsAI/chains/parallel.chain.ts
import { RunnableParallel, RunnableSequence } from "@langchain/core/runnables";
import { summaryChain } from "./summary.chain";
import { conceptsChain } from "./concepts.chain";
import { glossaryChain } from "./glossary.chain";

const parallel = RunnableParallel.from({
  summary: summaryChain,
  concepts: conceptsChain,
  glossary: glossaryChain,
});

export const insightsChain = parallel.withRetry({ stopAfterAttempt: 2 });
```

`RunnableParallel.from({...})` invokes the three sub-chains concurrently and returns `{ summary, concepts, glossary }` typed by their respective Zod schemas. `withRetry` retries the entire parallel block on any failure (Zod parse, OpenAI rate limit, etc.) up to 2 attempts before throwing.

---

## Step 4 — Service

```ts
// server/services/lessonInsightsAI/lessonInsightsAI.service.ts
import { createHash } from "node:crypto";
import { lessonRepository } from "@/server/repositories/lesson.repository";
import { lessonInsightsRepository } from "@/server/repositories/lessonInsights.repository";
import { insightsChain } from "./chains/parallel.chain";
import { LessonHasNoContentError, NotInstructorError } from "./lessonInsightsAI.errors";

const MODEL = "gpt-4o-mini";

class LessonInsightsAIService {
  async generateForLesson(lessonId: string, instructorId: string) {
    const lesson = await lessonRepository.findFirst({
      where: { id: lessonId, deletedAt: null, section: { course: { instructorId } } },
      select: { id: true, content: true },
    });

    if (!lesson) throw new NotInstructorError(lessonId);
    if (!lesson.content?.trim()) throw new LessonHasNoContentError(lessonId);

    const contentHash = createHash("sha256").update(lesson.content).digest("hex");
    const existing = await lessonInsightsRepository.findByLessonId(lessonId);
    if (existing && existing.contentHash === contentHash) return existing;

    const result = await insightsChain.invoke({ content: lesson.content });

    return lessonInsightsRepository.upsertByLessonId(lessonId, {
      summary: result.summary.summary,
      concepts: result.concepts.concepts,
      glossary: result.glossary.glossary,
      model: MODEL,
      contentHash,
    });
  }

  async getForLesson(lessonId: string) {
    return lessonInsightsRepository.findByLessonId(lessonId);
  }
}

export const lessonInsightsAIService = new LessonInsightsAIService();
```

Persistence is one transactional `upsert` so a successful generation always replaces the previous row atomically.

---

## Step 5 — tRPC procedures

```ts
// server/api/routers/ai.ts — add
generateLessonInsights: instructorProcedure
  .input(z.object({ lessonId: z.string() }))
  .mutation(({ ctx, input }) =>
    lessonInsightsAIService.generateForLesson(input.lessonId, ctx.session.user.id),
  ),

getLessonInsights: protectedProcedure
  .input(z.object({ lessonId: z.string() }))
  .query(({ input }) => lessonInsightsAIService.getForLesson(input.lessonId)),
```

The `getLessonInsights` query is `protectedProcedure` — both students (must be enrolled, gated by an existing service helper) and instructors can read.

---

## Step 6 — UI

**Instructor lesson edit page**

A small toolbar on the edit page:

```
┌──────────────────────────────────────┐
│  [✎ Edit lesson]                     │
│                                      │
│  Study guide:  [ Generate ]          │
│                Last generated · 2 m  │
│                ⚠ Content changed     │
│                                      │
└──────────────────────────────────────┘
```

`Generate` is disabled while the mutation is in flight. The "Content changed" badge appears whenever `contentHash` is stale (instructor saved new content after the last generation). On success, the toolbar updates with the new generation timestamp.

**Student lesson view**

A new component `app/_components/Lesson/components/StudyGuideCard/`. Renders three collapsible sections (Summary, Key Concepts, Glossary). Hidden when no `LessonInsights` exists.

---

## LangSmith tracing

`feature:summary` tag is added by the shared `traced` wrapper (ADR-013) around `LessonInsightsAIService.generateForLesson`. The `RunnableParallel` produces three child spans in the trace, making concurrent execution visible.

## Eval suite

A small dataset under `evals/datasets/lessonInsights.jsonl`: 10 lessons with hand-written reference summaries and concept lists. The eval scores summaries with `LLMAsJudge` (rubric: covers main idea? appropriate length? non-paraphrased?) and concept lists with set overlap against the reference.
