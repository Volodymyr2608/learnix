# Lesson Auto-Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an instructor clicks "Generate study guide" on a lesson with content, three LCEL chains run in parallel and persist a `LessonInsights` row (summary, key concepts, glossary); students see the result as a collapsible card.

**Architecture:** Pure LCEL chain pattern (ADR-008) — no agent, no tools. `RunnableParallel` drives three sub-chains concurrently, each using `withStructuredOutput`. A SHA-256 content hash gates regeneration. LangSmith `traced` wrapper tags every run with `feature:summary` per ADR-013.

**Tech Stack:** LangChain LCEL (`@langchain/core`, `@langchain/openai`), Prisma, tRPC, Next.js App Router, Zod, React / Sonner toasts.

---

## File Structure

**New files:**

| File | Responsibility |
|---|---|
| `prisma/schema/lesson.prisma` | Add `LessonInsights` model + back-relation on `Lesson` |
| `server/repositories/lessonInsights.repository.ts` | CRUD + `findByLessonId` + `upsertByLessonId` |
| `server/services/lessonInsightsAI/schemas/lessonInsights.schema.ts` | Zod output schemas for all three chains |
| `server/services/lessonInsightsAI/lessonInsightsAI.errors.ts` | `LessonHasNoContentError`, `NotInstructorError` |
| `server/services/lessonInsightsAI/chains/summary.chain.ts` | `prompt \| model.withStructuredOutput(SummarySchema)` |
| `server/services/lessonInsightsAI/chains/concepts.chain.ts` | `prompt \| model.withStructuredOutput(ConceptsSchema)` |
| `server/services/lessonInsightsAI/chains/glossary.chain.ts` | `prompt \| model.withStructuredOutput(GlossarySchema)` |
| `server/services/lessonInsightsAI/chains/parallel.chain.ts` | `RunnableParallel` + `.withRetry({ stopAfterAttempt: 2 })` |
| `server/services/lessonInsightsAI/lessonInsightsAI.service.ts` | Cache check, invoke chain, persist |
| `server/api/routers/lessonInsightsAI.ts` | `generateLessonInsights` + `getLessonInsights` procedures |
| `app/_components/Course/components/Lesson/LessonContentEditor/components/StudyGuideToolbar/index.tsx` | Instructor "Generate study guide" button + stale badge |
| `app/_components/Course/components/Lesson/StudyGuideCard/index.tsx` | Student collapsible study guide card |

**Modified files:**

| File | Change |
|---|---|
| `prisma/schema/lesson.prisma` | Add `LessonInsights` model + `lessonInsights LessonInsights?` on `Lesson` |
| `server/api/root.ts` | Register `lessonInsightsAIRouter` as `lessonInsightsAI` |
| `app/_components/Course/components/Lesson/LessonContentEditor/hooks/useLessonEditor.ts` | Expose `lastSavedAt: Date \| null` |
| `app/_components/Course/components/Lesson/LessonContentEditor/index.tsx` | Mount `StudyGuideToolbar` |
| `app/_components/Course/components/CourseLearnView/index.tsx` | Mount `StudyGuideCard` in Overview tab |

---

## Task 1: Prisma Schema + Migration

**Files:**
- Modify: `prisma/schema/lesson.prisma`

- [ ] **Step 1: Add `LessonInsights` model and back-relation**

Open `prisma/schema/lesson.prisma` and append the model, then add the back-relation field to `Lesson`:

```prisma
// At the bottom of the file — add after LessonProgress
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
  @@map("lesson_insights")
}
```

Also add the back-relation field to the `Lesson` model (inside the existing model block, after `progresses LessonProgress[]`):

```prisma
  lessonInsights LessonInsights?
```

- [ ] **Step 2: Generate and apply migration**

```bash
pnpm db:generate
```

When prompted for a migration name, enter: `add_lesson_insights`

Expected: migration file created under `prisma/migrations/`, Prisma client regenerated. No errors.

- [ ] **Step 3: Verify type is available**

```bash
pnpm typecheck
```

Expected: no errors (the new `LessonInsights` type is now available from `@/generated/prisma`).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema/lesson.prisma prisma/migrations/ generated/
git commit -m "feat: add LessonInsights schema and migration"
```

---

## Task 2: Repository

**Files:**
- Create: `server/repositories/lessonInsights.repository.ts`

- [ ] **Step 1: Create the repository**

```typescript
// server/repositories/lessonInsights.repository.ts
import type { LessonInsights, Prisma } from "@/generated/prisma";
import { BaseRepository } from "@/server/repositories/base/base.repository";

class LessonInsightsRepository extends BaseRepository<
  "lessonInsights",
  LessonInsights,
  Prisma.LessonInsightsUncheckedCreateInput,
  Prisma.LessonInsightsUpdateInput,
  Prisma.LessonInsightsWhereInput,
  Prisma.LessonInsightsInclude,
  Prisma.LessonInsightsSelect,
  Prisma.LessonInsightsOrderByWithRelationInput
> {
  protected readonly modelName = "lessonInsights" as const;

  async findByLessonId(lessonId: string): Promise<LessonInsights | null> {
    return this.db.lessonInsights.findUnique({ where: { lessonId } });
  }

  async upsertByLessonId(
    lessonId: string,
    data: {
      summary: string;
      concepts: Prisma.InputJsonValue;
      glossary: Prisma.InputJsonValue;
      model: string;
      contentHash: string;
    },
  ): Promise<LessonInsights> {
    return this.db.lessonInsights.upsert({
      where: { lessonId },
      create: { lessonId, ...data },
      update: { ...data, generatedAt: new Date() },
    });
  }
}

export const lessonInsightsRepository = new LessonInsightsRepository();
```

- [ ] **Step 2: Verify types**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/repositories/lessonInsights.repository.ts
git commit -m "feat: add LessonInsightsRepository"
```

---

## Task 3: Zod Schemas and Error Types

**Files:**
- Create: `server/services/lessonInsightsAI/schemas/lessonInsights.schema.ts`
- Create: `server/services/lessonInsightsAI/lessonInsightsAI.errors.ts`

- [ ] **Step 1: Create Zod output schemas**

```typescript
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

export type SummaryOutput = z.infer<typeof SummarySchema>;
export type ConceptsOutput = z.infer<typeof ConceptsSchema>;
export type GlossaryOutput = z.infer<typeof GlossarySchema>;
export type Concept = ConceptsOutput["concepts"][number];
export type GlossaryItem = GlossaryOutput["glossary"][number];
```

- [ ] **Step 2: Create error types**

```typescript
// server/services/lessonInsightsAI/lessonInsightsAI.errors.ts
import { DomainError } from "@/server/services/base/base.errors";

export class LessonInsightsAIError extends DomainError {}

export class LessonHasNoContentError extends DomainError {
  constructor(lessonId: string) {
    super(
      "This lesson has no content to summarise",
      "BAD_REQUEST",
      undefined,
      { lessonId },
    );
  }
}

export class NotInstructorError extends DomainError {
  constructor(lessonId: string) {
    super(
      "Lesson not found or access denied",
      "FORBIDDEN",
      undefined,
      { lessonId },
    );
  }
}
```

- [ ] **Step 3: Verify types**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add server/services/lessonInsightsAI/
git commit -m "feat: add LessonInsightsAI schemas and error types"
```

---

## Task 4: Three LCEL Sub-chains

**Files:**
- Create: `server/services/lessonInsightsAI/chains/summary.chain.ts`
- Create: `server/services/lessonInsightsAI/chains/concepts.chain.ts`
- Create: `server/services/lessonInsightsAI/chains/glossary.chain.ts`

- [ ] **Step 1: Create summary chain**

```typescript
// server/services/lessonInsightsAI/chains/summary.chain.ts
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import { SummarySchema } from "../schemas/lessonInsights.schema";

const prompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    "You are a study-guide editor. Given the full text of a lesson, write a single concise paragraph (60–150 words) that captures the lesson's purpose, main argument or technique, and the practical takeaway. No bullet points, no headers.",
  ],
  ["human", "{content}"],
]);

const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0.2 }).withStructuredOutput(
  SummarySchema,
);

export const summaryChain = prompt.pipe(llm);
```

- [ ] **Step 2: Create concepts chain**

```typescript
// server/services/lessonInsightsAI/chains/concepts.chain.ts
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import { ConceptsSchema } from "../schemas/lessonInsights.schema";

const prompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    "You are a study-guide editor. Given the full text of a lesson, identify the 3–7 most important concepts the student must understand. For each concept, provide a short name (1–5 words) and a one-sentence explanation (10–300 characters). Return only concepts explicitly covered in the lesson.",
  ],
  ["human", "{content}"],
]);

const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0.2 }).withStructuredOutput(
  ConceptsSchema,
);

export const conceptsChain = prompt.pipe(llm);
```

- [ ] **Step 3: Create glossary chain**

```typescript
// server/services/lessonInsightsAI/chains/glossary.chain.ts
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import { GlossarySchema } from "../schemas/lessonInsights.schema";

const prompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    "You are a study-guide editor. Given the full text of a lesson, extract domain-specific terms and jargon that a beginner might not know. For each term, provide its name and a plain-language definition (10–300 characters). Return an empty list if the lesson contains no special terminology.",
  ],
  ["human", "{content}"],
]);

const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0.2 }).withStructuredOutput(
  GlossarySchema,
);

export const glossaryChain = prompt.pipe(llm);
```

- [ ] **Step 4: Verify types**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add server/services/lessonInsightsAI/chains/
git commit -m "feat: add three LCEL sub-chains for lesson insights"
```

---

## Task 5: Parallel Chain Composition

**Files:**
- Create: `server/services/lessonInsightsAI/chains/parallel.chain.ts`

- [ ] **Step 1: Create the parallel chain**

```typescript
// server/services/lessonInsightsAI/chains/parallel.chain.ts
import { RunnableParallel } from "@langchain/core/runnables";
import { conceptsChain } from "./concepts.chain";
import { glossaryChain } from "./glossary.chain";
import { summaryChain } from "./summary.chain";

const parallel = RunnableParallel.from({
  summary: summaryChain,
  concepts: conceptsChain,
  glossary: glossaryChain,
});

export const insightsChain = parallel.withRetry({ stopAfterAttempt: 2 });
```

`RunnableParallel.from({...})` invokes all three sub-chains concurrently with the same `{ content: string }` input and returns `{ summary: SummaryOutput, concepts: ConceptsOutput, glossary: GlossaryOutput }`. `.withRetry({ stopAfterAttempt: 2 })` retries the entire parallel block on any failure before throwing.

- [ ] **Step 2: Verify types**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/services/lessonInsightsAI/chains/parallel.chain.ts
git commit -m "feat: add RunnableParallel composition for lesson insights"
```

---

## Task 6: Service

**Files:**
- Create: `server/services/lessonInsightsAI/lessonInsightsAI.service.ts`

- [ ] **Step 1: Create the service**

```typescript
// server/services/lessonInsightsAI/lessonInsightsAI.service.ts
import { createHash } from "node:crypto";
import { lessonRepository } from "@/server/repositories/lesson.repository";
import { lessonInsightsRepository } from "@/server/repositories/lessonInsights.repository";
import { traced } from "@/server/services/_shared/tracing";
import { insightsChain } from "./chains/parallel.chain";
import {
  LessonHasNoContentError,
  NotInstructorError,
} from "./lessonInsightsAI.errors";

const MODEL = "gpt-4o-mini";

class LessonInsightsAIService {
  async generateForLesson(lessonId: string, instructorId: string) {
    const coreGenerate = traced(
      "lessonInsightsAI.generateForLesson",
      async (lId: string): Promise<ReturnType<typeof lessonInsightsRepository.upsertByLessonId>> => {
        const lesson = await lessonRepository.findFirst({
          where: {
            id: lId,
            deletedAt: null,
            section: { course: { instructorId } },
          },
          select: { id: true, content: true },
        });

        if (!lesson) throw new NotInstructorError(lId);
        if (!lesson.content?.trim()) throw new LessonHasNoContentError(lId);

        const contentHash = createHash("sha256")
          .update(lesson.content)
          .digest("hex");

        const existing = await lessonInsightsRepository.findByLessonId(lId);
        if (existing?.contentHash === contentHash) return existing;

        const result = await insightsChain.invoke({ content: lesson.content });

        return lessonInsightsRepository.upsertByLessonId(lId, {
          summary: result.summary.summary,
          concepts: result.concepts.concepts as unknown as import("@/generated/prisma").Prisma.InputJsonValue,
          glossary: result.glossary.glossary as unknown as import("@/generated/prisma").Prisma.InputJsonValue,
          model: MODEL,
          contentHash,
        });
      },
      { feature: "summary", userId: instructorId, model: MODEL },
    );

    return coreGenerate(lessonId);
  }

  async getForLesson(lessonId: string) {
    return lessonInsightsRepository.findByLessonId(lessonId);
  }
}

export const lessonInsightsAIService = new LessonInsightsAIService();
```

- [ ] **Step 2: Verify types**

```bash
pnpm typecheck
```

Expected: no errors. If the inline `import()` for `Prisma.InputJsonValue` is flagged, replace with a top-level import: `import type { Prisma } from "@/generated/prisma"` and use `Prisma.InputJsonValue` directly.

- [ ] **Step 3: Fix import if needed**

If step 2 shows errors on the inline imports, refactor the service to use a top-level import:

```typescript
// server/services/lessonInsightsAI/lessonInsightsAI.service.ts
import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma";
import { lessonRepository } from "@/server/repositories/lesson.repository";
import { lessonInsightsRepository } from "@/server/repositories/lessonInsights.repository";
import { traced } from "@/server/services/_shared/tracing";
import { insightsChain } from "./chains/parallel.chain";
import {
  LessonHasNoContentError,
  NotInstructorError,
} from "./lessonInsightsAI.errors";

const MODEL = "gpt-4o-mini";

class LessonInsightsAIService {
  async generateForLesson(lessonId: string, instructorId: string) {
    const coreGenerate = traced(
      "lessonInsightsAI.generateForLesson",
      async (lId: string) => {
        const lesson = await lessonRepository.findFirst({
          where: {
            id: lId,
            deletedAt: null,
            section: { course: { instructorId } },
          },
          select: { id: true, content: true },
        });

        if (!lesson) throw new NotInstructorError(lId);
        if (!lesson.content?.trim()) throw new LessonHasNoContentError(lId);

        const contentHash = createHash("sha256")
          .update(lesson.content)
          .digest("hex");

        const existing = await lessonInsightsRepository.findByLessonId(lId);
        if (existing?.contentHash === contentHash) return existing;

        const result = await insightsChain.invoke({ content: lesson.content });

        return lessonInsightsRepository.upsertByLessonId(lId, {
          summary: result.summary.summary,
          concepts: result.concepts.concepts as unknown as Prisma.InputJsonValue,
          glossary: result.glossary.glossary as unknown as Prisma.InputJsonValue,
          model: MODEL,
          contentHash,
        });
      },
      { feature: "summary", userId: instructorId, model: MODEL },
    );

    return coreGenerate(lessonId);
  }

  async getForLesson(lessonId: string) {
    return lessonInsightsRepository.findByLessonId(lessonId);
  }
}

export const lessonInsightsAIService = new LessonInsightsAIService();
```

- [ ] **Step 4: Commit**

```bash
git add server/services/lessonInsightsAI/lessonInsightsAI.service.ts
git commit -m "feat: add LessonInsightsAIService with cache check and parallel chain"
```

---

## Task 7: tRPC Router

**Files:**
- Create: `server/api/routers/lessonInsightsAI.ts`
- Modify: `server/api/root.ts`

- [ ] **Step 1: Create the router**

```typescript
// server/api/routers/lessonInsightsAI.ts
import { z } from "zod";
import {
  createTRPCRouter,
  instructorProcedure,
  protectedProcedure,
} from "@/server/api/trpc";
import { lessonInsightsAIService } from "@/server/services/lessonInsightsAI/lessonInsightsAI.service";
import { handleServiceError } from "@/server/utils/handleServiceError";

export const lessonInsightsAIRouter = createTRPCRouter({
  generateLessonInsights: instructorProcedure
    .input(z.object({ lessonId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await lessonInsightsAIService.generateForLesson(
          input.lessonId,
          ctx.session.user.id,
        );
      } catch (error) {
        handleServiceError(error);
      }
    }),

  getLessonInsights: protectedProcedure
    .input(z.object({ lessonId: z.string() }))
    .query(async ({ input }) => {
      try {
        return await lessonInsightsAIService.getForLesson(input.lessonId);
      } catch (error) {
        handleServiceError(error);
      }
    }),
});
```

- [ ] **Step 2: Register in root.ts**

In `server/api/root.ts`, add the import and register the router:

```typescript
// Add to imports:
import { lessonInsightsAIRouter } from "@/server/api/routers/lessonInsightsAI";

// Add to appRouter:
export const appRouter = createTRPCRouter({
  user: userRouter,
  course: courseRouter,
  courseAI: courseAIRouter,
  instructor: instructorRouter,
  lesson: lessonRouter,
  lessonInsightsAI: lessonInsightsAIRouter,  // add this line
  quiz: quizRouter,
});
```

- [ ] **Step 3: Verify types**

```bash
pnpm typecheck
```

Expected: no errors. The new procedures are now part of the AppRouter and accessible via `api.lessonInsightsAI.*` on both server and client.

- [ ] **Step 4: Commit**

```bash
git add server/api/routers/lessonInsightsAI.ts server/api/root.ts
git commit -m "feat: add lessonInsightsAI tRPC router"
```

---

## Task 8: Instructor UI — StudyGuideToolbar

**Files:**
- Create: `app/_components/Course/components/Lesson/LessonContentEditor/components/StudyGuideToolbar/index.tsx`
- Modify: `app/_components/Course/components/Lesson/LessonContentEditor/hooks/useLessonEditor.ts`
- Modify: `app/_components/Course/components/Lesson/LessonContentEditor/index.tsx`

- [ ] **Step 1: Expose `lastSavedAt` from `useLessonEditor`**

In `useLessonEditor.ts`, add a `lastSavedAt` state and set it in `updateContent.onSuccess`:

```typescript
// Add near the top of the hook, before updateContent:
const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

// Modify the updateContent mutation:
const updateContent = api.lesson.updateContent.useMutation({
  onSuccess: () => {
    toast.success("Lesson saved successfully.");
    setLastSavedAt(new Date());
  },
  onError: (err) => toast.error(err.message),
});
```

Also add `lastSavedAt` to the return object:

```typescript
return {
  lessonData,
  updateLessonData,
  resources,
  addResource,
  removeResource,
  updateResource,
  quizQuestions,
  addQuizQuestion,
  removeQuizQuestion,
  updateQuiz,
  updateQuizOption,
  replaceQuizFromGenerated,
  isSaving: updateContent.isPending,
  lastSavedAt,   // add this
  handleSave,
};
```

- [ ] **Step 2: Create the StudyGuideToolbar component**

```typescript
// app/_components/Course/components/Lesson/LessonContentEditor/components/StudyGuideToolbar/index.tsx
"use client";

import { AlertTriangle, BookOpen, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/app/_components/_shared/ui/badge";
import { Button } from "@/app/_components/_shared/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/_components/_shared/ui/card";
import { api } from "@/trpc/client";

interface StudyGuideToolbarProps {
  lessonId: string;
  lastSavedAt: Date | null;
}

export function StudyGuideToolbar({ lessonId, lastSavedAt }: StudyGuideToolbarProps) {
  const utils = api.useUtils();

  const { data: insights } = api.lessonInsightsAI.getLessonInsights.useQuery(
    { lessonId },
  );

  const generate = api.lessonInsightsAI.generateLessonInsights.useMutation({
    onSuccess: () => {
      toast.success("Study guide generated.");
      utils.lessonInsightsAI.getLessonInsights.invalidate({ lessonId });
    },
    onError: (err) => {
      if (err.data?.code === "BAD_REQUEST") {
        toast.error("This lesson has no content to summarise.");
      } else {
        toast.error("Generation failed. Please try again.");
      }
    },
  });

  const isStale =
    insights !== null &&
    insights !== undefined &&
    lastSavedAt !== null &&
    new Date(insights.generatedAt) < lastSavedAt;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="h-4 w-4" />
          Study Guide
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <Button
            disabled={generate.isPending}
            onClick={() => generate.mutate({ lessonId })}
            size="sm"
            variant="outline"
          >
            {generate.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {generate.isPending ? "Generating…" : "Generate study guide"}
          </Button>

          {insights && !isStale && (
            <span className="flex items-center gap-1 text-muted-foreground text-xs">
              <CheckCircle2 className="h-3 w-3 text-green-500" />
              Last generated{" "}
              {new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
                Math.round(
                  (new Date(insights.generatedAt).getTime() - Date.now()) / 60000,
                ),
                "minute",
              )}
            </span>
          )}

          {isStale && (
            <Badge className="gap-1" variant="secondary">
              <AlertTriangle className="h-3 w-3" />
              Content changed
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Mount `StudyGuideToolbar` in `LessonContentEditor`**

In `LessonContentEditor/index.tsx`, destructure `lastSavedAt` from `useLessonEditor` and render the toolbar:

```typescript
// Add import at top:
import { StudyGuideToolbar } from "./components/StudyGuideToolbar";

// Destructure in the component body:
const {
  lessonData,
  updateLessonData,
  resources,
  addResource,
  removeResource,
  updateResource,
  quizQuestions,
  addQuizQuestion,
  removeQuizQuestion,
  updateQuiz,
  updateQuizOption,
  replaceQuizFromGenerated,
  isSaving,
  lastSavedAt,      // add this
  handleSave,
} = useLessonEditor(initialLesson);

// Add the toolbar before the Tabs, after LessonInfoCard:
return (
  <div className="space-y-6">
    <LessonInfoCard data={lessonData} onUpdate={updateLessonData} />

    <StudyGuideToolbar lessonId={initialLesson.id} lastSavedAt={lastSavedAt} />

    <Tabs className="space-y-4" defaultValue="video">
      {/* ... rest unchanged ... */}
    </Tabs>

    <EditorActions
      courseId={courseId}
      isSaving={isSaving}
      lessonId={initialLesson.id}
      onSave={handleSave}
    />
  </div>
);
```

- [ ] **Step 4: Verify types**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 5: Verify lint**

```bash
pnpm check
```

Expected: no lint or format issues. Run `pnpm check:write` to auto-fix import order if needed.

- [ ] **Step 6: Commit**

```bash
git add app/_components/Course/components/Lesson/LessonContentEditor/
git commit -m "feat: add StudyGuideToolbar to instructor lesson editor"
```

---

## Task 9: Student UI — StudyGuideCard

**Files:**
- Create: `app/_components/Course/components/Lesson/StudyGuideCard/index.tsx`
- Modify: `app/_components/Course/components/CourseLearnView/index.tsx`

- [ ] **Step 1: Create the StudyGuideCard component**

```typescript
// app/_components/Course/components/Lesson/StudyGuideCard/index.tsx
"use client";

import { BookOpen, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/_components/_shared/ui/card";
import { Separator } from "@/app/_components/_shared/ui/separator";
import { api } from "@/trpc/client";

type Concept = { name: string; explanation: string };
type GlossaryItem = { term: string; definition: string };

function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        className="flex w-full items-center gap-2 py-2 text-left font-semibold text-sm hover:text-foreground/80"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0" />
        )}
        {title}
      </button>
      {open && <div className="pb-2 pl-6">{children}</div>}
    </div>
  );
}

export function StudyGuideCard({ lessonId }: { lessonId: string }) {
  const { data: insights } = api.lessonInsightsAI.getLessonInsights.useQuery(
    { lessonId },
  );

  if (!insights) return null;

  const concepts = insights.concepts as Concept[];
  const glossary = insights.glossary as GlossaryItem[];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="h-4 w-4" />
          Study Guide
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 pt-0">
        <CollapsibleSection defaultOpen title="Summary">
          <p className="text-muted-foreground text-sm leading-relaxed">
            {insights.summary}
          </p>
        </CollapsibleSection>

        <Separator />

        <CollapsibleSection title={`Key Concepts (${concepts.length})`}>
          <ul className="space-y-3">
            {concepts.map((c) => (
              <li key={c.name}>
                <p className="font-medium text-sm">{c.name}</p>
                <p className="text-muted-foreground text-xs">{c.explanation}</p>
              </li>
            ))}
          </ul>
        </CollapsibleSection>

        {glossary.length > 0 && (
          <>
            <Separator />
            <CollapsibleSection title={`Glossary (${glossary.length})`}>
              <dl className="space-y-3">
                {glossary.map((g) => (
                  <div key={g.term}>
                    <dt className="font-medium text-sm">{g.term}</dt>
                    <dd className="text-muted-foreground text-xs">
                      {g.definition}
                    </dd>
                  </div>
                ))}
              </dl>
            </CollapsibleSection>
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Add StudyGuideCard to CourseLearnView**

In `CourseLearnView/index.tsx`, import the card and add it in the Overview tab, after the `QuizPlayer`:

```typescript
// Add import at top:
import { StudyGuideCard } from "@/app/_components/Course/components/Lesson/StudyGuideCard";

// Inside TabsContent value="overview", after <QuizPlayer lessonId={lessonId} />:
<QuizPlayer lessonId={lessonId} />

<StudyGuideCard lessonId={lessonId} />
```

- [ ] **Step 3: Verify types**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Verify lint**

```bash
pnpm check
```

Expected: no issues. Run `pnpm check:write` to auto-fix import order if needed.

- [ ] **Step 5: Verify build**

```bash
pnpm build
```

Expected: production build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add app/_components/Course/components/Lesson/StudyGuideCard/ app/_components/Course/components/CourseLearnView/index.tsx
git commit -m "feat: add StudyGuideCard to student lesson view"
```

---

## Validation Checklist

After all tasks are done, verify manually:

- [ ] **S1**: Open instructor lesson edit page with content → click "Generate study guide" → button shows loading → toolbar updates with "Last generated just now".
- [ ] **S2**: Click "Generate study guide" again immediately → response is fast (<200 ms); no new `generatedAt` in Prisma Studio.
- [ ] **S3**: Edit lesson content and save → "Content changed" badge appears → click generate → badge disappears.
- [ ] **S4**: Open lesson with empty content → click generate → error toast "This lesson has no content to summarise".
- [ ] **S5**: Sign in as different instructor → attempt `generateLessonInsights` → FORBIDDEN.
- [ ] **S6**: Sign in as enrolled student → open lesson → StudyGuideCard renders with 3 collapsible sections. Lesson with no insights → no card.
- [ ] **S7**: With `LANGSMITH_TRACING=true` → generate insights → LangSmith shows 3 child spans starting nearly simultaneously.