# Plan: Personalized Learning Path Agent

## Implementation order

1. Prisma model + migration + repository.
2. Zod schemas + error classes.
3. Deterministic nodes (`loadStudentSignal`, `identifyWeakSignals`, `decideStrategy`, `proposeReviews`, `proposeNewLessons`).
4. Tools (`getLessonSummary`, `getQuizAttemptHistory`).
5. LLM nodes (`mergeAndExplain` with semantic-validator retry, `reflectAndCheck`).
6. Graph wiring (compile `StateGraph`).
7. Service + LangSmith tracing.
8. tRPC router + SSE route.
9. Invalidation hooks in `LessonService` / `QuizService`.
10. UI: `LearningPathCard` + sub-components + course-page integration.
11. End-to-end manual test + polish.

This plan inherits the agent/service layout from `server/services/lessonAI/` and the SSE route shape from `app/api/chat/lesson/`.

---

## Step 1 — Prisma model + repository

`prisma/schema/course.prisma` — add to the bottom:

```prisma
model LearningPathCache {
  id           String    @id @default(cuid())
  studentId    String
  courseId     String
  steps        Json
  summary      String    @db.Text
  weakConcepts Json
  model        String
  generatedAt  DateTime  @default(now())
  staleAt      DateTime?

  student User   @relation(fields: [studentId], references: [id], onDelete: Cascade)
  course  Course @relation(fields: [courseId], references: [id], onDelete: Cascade)

  @@unique([studentId, courseId])
  @@map("learning_path_cache")
}
```

Add back-relations to `User` and `Course`:

```prisma
// auth.prisma — User
learningPathCaches LearningPathCache[]

// course.prisma — Course
learningPathCaches LearningPathCache[]
```

Run `pnpm db:generate` (creates a new migration).

`server/repositories/learningPath.repository.ts`:

```ts
import { db } from "@/server/db";
import { BaseRepository } from "./base/base.repository";

class LearningPathRepository extends BaseRepository<"learningPathCache"> {
  constructor() {
    super(db.learningPathCache);
  }

  findByStudentCourse(studentId: string, courseId: string) {
    return db.learningPathCache.findUnique({
      where: { studentId_courseId: { studentId, courseId } },
    });
  }

  upsertPath(input: {
    studentId: string;
    courseId: string;
    steps: PathStep[];
    summary: string;
    weakConcepts: string[];
    model: string;
  }) {
    return this.upsert({
      where: { studentId_courseId: { studentId: input.studentId, courseId: input.courseId } },
      create: { ...input, staleAt: null },
      update: { ...input, generatedAt: new Date(), staleAt: null },
    });
  }

  markStale(studentId: string, courseId: string) {
    return db.learningPathCache.updateMany({
      where: { studentId, courseId, staleAt: null },
      data: { staleAt: new Date() },
    });
  }
}

export const learningPathRepository = new LearningPathRepository();
```

---

## Step 2 — Schemas + errors

`server/services/learningPathAI/schemas/learningPath.schema.ts`:

```ts
import { z } from "zod";

export const PathStepTypeSchema = z.enum(["NEW_LESSON", "REVIEW_LESSON", "RETRY_QUIZ"]);

export const PathStepSchema = z.object({
  type: PathStepTypeSchema,
  lessonId: z.string(),
  quizId: z.string().optional(),
  title: z.string(),
  reason: z.string().min(20),
});

export const LearningPathSchema = z.object({
  steps: z.array(PathStepSchema).min(1).max(5),
  summary: z.string().min(20),
  weakConcepts: z.array(z.string()).max(8),
});

export type PathStep = z.infer<typeof PathStepSchema>;
export type LearningPath = z.infer<typeof LearningPathSchema>;
```

`server/services/learningPathAI/learningPathAI.errors.ts`:

```ts
export class LearningPathError extends Error { /* base */ }
export class LearningPathTransientError extends LearningPathError {}
export class LearningPathInvalidError extends LearningPathError {}
export class CourseUnavailableError extends LearningPathError {}
export class LearningPathRateLimitedError extends LearningPathError {}
```

Map to tRPC errors in `server/api/_shared/mapError.ts` (per ADR-010).

---

## Step 3 — Deterministic nodes

State type:

```ts
// server/services/learningPathAI/learningPathAI.state.ts
import { Annotation } from "@langchain/langgraph";

export const PathStateAnnotation = Annotation.Root({
  studentId: Annotation<string>(),
  courseId:  Annotation<string>(),
  completedLessonIds: Annotation<string[]>({ default: () => [] }),
  lessonOrder: Annotation<LessonOrderRow[]>({ default: () => [] }),
  quizAttempts: Annotation<QuizAttemptRow[]>({ default: () => [] }),
  mastery: Annotation<MasteryRow[]>({ default: () => [] }),
  weakConcepts: Annotation<WeakConceptRow[]>({ default: () => [] }),
  failedQuizzes: Annotation<FailedQuizRow[]>({ default: () => [] }),
  candidateSteps: Annotation<DraftStep[]>({ default: () => [] }),
  finalSteps: Annotation<PathStep[]>({ default: () => [] }),
  summary: Annotation<string>({ default: () => "" }),
  reflectionAttempt: Annotation<number>({ default: () => 0 }),
  reflectionFeedback: Annotation<string | undefined>({ default: () => undefined }),
});
```

`server/services/learningPathAI/nodes/loadStudentSignal.node.ts`:

```ts
export async function loadStudentSignal(state: PathState): Promise<Partial<PathState>> {
  const { studentId, courseId } = state;

  const [enrollment, lessons, attempts, mastery] = await Promise.all([
    enrollmentRepository.findByStudentCourse(studentId, courseId),
    lessonRepository.listOrderedWithConcepts(courseId),
    quizAttemptRepository.latestPerQuizForStudent(studentId, courseId),
    conceptMasteryRepository.byStudentCourse(studentId, courseId),
  ]);

  if (!enrollment || enrollment.course.deletedAt || !enrollment.course.published) {
    throw new CourseUnavailableError("Course not enrolled or unavailable");
  }

  return {
    completedLessonIds: lessons.filter(l => l.isCompleted).map(l => l.id),
    lessonOrder: lessons.map(l => ({
      id: l.id, sectionOrder: l.sectionOrder, lessonOrder: l.order, concepts: l.concepts,
    })),
    quizAttempts: attempts,
    mastery,
  };
}
```

`identifyWeakSignals.node.ts`:

```ts
export function identifyWeakSignals(state: PathState): Partial<PathState> {
  const weakConcepts = state.mastery
    .filter(m => m.level < 3)
    .map(m => ({
      concept: m.concept,
      level: m.level,
      firstLessonId: state.lessonOrder.find(l => l.concepts.includes(m.concept))?.id ?? "",
    }))
    .filter(w => w.firstLessonId);

  const failedQuizzes = state.quizAttempts.filter(a => !a.isCorrect)
    .map(a => ({ lessonId: a.lessonId, quizId: a.quizId }));

  return { weakConcepts, failedQuizzes };
}
```

`decideStrategy.node.ts` is a conditional-edge function, not a node — used in graph wiring (Step 6).

`proposeReviews.node.ts`:

```ts
export function proposeReviews(state: PathState): Partial<PathState> {
  const reviewSteps = state.weakConcepts.slice(0, 3).map<DraftStep>(w => ({
    type: "REVIEW_LESSON",
    lessonId: w.firstLessonId,
    reasonSeed: `Mastery of ${w.concept} is ${w.level}/5`,
  }));
  const retrySteps = state.failedQuizzes.slice(0, 2).map<DraftStep>(f => ({
    type: "RETRY_QUIZ",
    lessonId: f.lessonId,
    quizId: f.quizId,
    reasonSeed: "Previous attempt was incorrect",
  }));
  return { candidateSteps: [...reviewSteps, ...retrySteps] };
}
```

`proposeNewLessons.node.ts`:

```ts
export function proposeNewLessons(state: PathState): Partial<PathState> {
  const next = state.lessonOrder
    .filter(l => !state.completedLessonIds.includes(l.id))
    .sort((a, b) => a.sectionOrder - b.sectionOrder || a.lessonOrder - b.lessonOrder)
    .slice(0, 3)
    .map<DraftStep>(l => ({ type: "NEW_LESSON", lessonId: l.id, reasonSeed: "Next in sequence" }));
  return { candidateSteps: [...(state.candidateSteps ?? []), ...next] };
}
```

---

## Step 4 — Tools

`server/services/learningPathAI/tools/getLessonSummary.tool.ts`:

```ts
export const buildGetLessonSummaryTool = (courseId: string) =>
  tool(
    async ({ lessonId }) => {
      const insights = await lessonInsightsRepository.findByLesson(lessonId);
      if (!insights) {
        const lesson = await lessonRepository.findById(lessonId);
        return { summary: lesson?.description ?? null, concepts: [], glossary: [] };
      }
      return insights;
    },
    {
      name: "get_lesson_summary",
      description: "Returns the LessonInsights summary / concepts / glossary for a lesson in this course. Falls back to lesson.description if insights are missing.",
      schema: z.object({ lessonId: z.string() }),
    },
  );
```

`getQuizAttemptHistory.tool.ts` follows the same shape — returns the last 5 `QuizAttempt`s for the lesson scoped to the student.

---

## Step 5 — LLM nodes

`mergeAndExplain.node.ts`:

```ts
const mergePrompt = ChatPromptTemplate.fromMessages([
  ["system", `You are planning a student's next learning steps in a single course.
Inputs:
- candidateSteps[]: ordered draft actions
- weakConcepts[]: concepts the student is shaky on
- summary so far: prior reflection feedback (if any)
Use tools (get_lesson_summary, get_quiz_attempt_history) only if the candidate's
title or reason is unclear. Produce 3–5 final steps with concrete reasons.`],
  ["human", `Course: {courseTitle}
Candidates: {candidateJson}
Weak concepts: {weakJson}
Reflection feedback (may be empty): {reflectionFeedback}`],
]);

const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0.3 })
  .bindTools([buildGetLessonSummaryTool(courseId), buildGetQuizAttemptHistoryTool(studentId, courseId)])
  .withStructuredOutput(LearningPathSchema);

export async function mergeAndExplain(state: PathState): Promise<Partial<PathState>> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const draft = await mergePrompt.pipe(llm).invoke({ /* fields */ });
    const violation = semanticValidate(draft, state);
    if (!violation) return { finalSteps: draft.steps, summary: draft.summary };
    // re-prompt with the violation as additional human message
  }
  throw new LearningPathInvalidError("Failed schema after 3 attempts");
}
```

`semanticValidate(draft, state)` returns a violation string or `null`. Rules from requirements (`NEW_LESSON.lessonId` not in completed, `REVIEW_LESSON.lessonId` in completed, `RETRY_QUIZ.quizId` references a failed quiz, all lessons in course).

`reflectAndCheck.node.ts`:

```ts
const critic = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 })
  .withStructuredOutput(z.object({ ok: z.boolean(), feedback: z.string() }));

export async function reflectAndCheck(state: PathState): Promise<Partial<PathState>> {
  if (state.reflectionAttempt >= 2) return {};
  const { ok, feedback } = await critic.invoke([
    { role: "system", content: "Review the proposed learning path. Flag if there are too many reviews, missing weak concepts, or repeated lessons." },
    { role: "human", content: JSON.stringify({ steps: state.finalSteps, weakConcepts: state.weakConcepts }) },
  ]);
  if (ok) return {};
  return { reflectionFeedback: feedback, reflectionAttempt: state.reflectionAttempt + 1 };
}
```

---

## Step 6 — Graph wiring

`server/services/learningPathAI/learningPathAI.graph.ts`:

```ts
import { StateGraph, START, END } from "@langchain/langgraph";
import { PathStateAnnotation } from "./learningPathAI.state";
import * as nodes from "./nodes";

export function buildLearningPathGraph() {
  return new StateGraph(PathStateAnnotation)
    .addNode("loadStudentSignal", nodes.loadStudentSignal)
    .addNode("identifyWeakSignals", nodes.identifyWeakSignals)
    .addNode("proposeReviews", nodes.proposeReviews)
    .addNode("proposeNewLessons", nodes.proposeNewLessons)
    .addNode("mergeAndExplain", nodes.mergeAndExplain)
    .addNode("reflectAndCheck", nodes.reflectAndCheck)
    .addEdge(START, "loadStudentSignal")
    .addEdge("loadStudentSignal", "identifyWeakSignals")
    .addConditionalEdges("identifyWeakSignals", decideStrategy, {
      hasWeak: "proposeReviews",
      ready:   "proposeNewLessons",
      empty:   "proposeNewLessons", // short-circuit: no LLM
    })
    .addEdge("proposeReviews", "proposeNewLessons")
    .addEdge("proposeNewLessons", "mergeAndExplain")
    .addEdge("mergeAndExplain", "reflectAndCheck")
    .addConditionalEdges("reflectAndCheck", (s) =>
      s.reflectionFeedback && s.reflectionAttempt < 2 ? "mergeAndExplain" : END,
    )
    .compile();
}

function decideStrategy(s: PathState) {
  if (s.completedLessonIds.length === 0 && s.quizAttempts.length === 0) return "empty";
  if (s.weakConcepts.length > 0 || s.failedQuizzes.length > 0) return "hasWeak";
  return "ready";
}
```

For the `empty` branch, `proposeNewLessons` produces canned steps and `mergeAndExplain` is bypassed via a flag in state (or by setting `candidateSteps` directly and adding an alternate edge to `END`). For simplicity in v1, mark a state flag `skipLLM=true` in `decideStrategy` and have `mergeAndExplain` early-return the candidates verbatim when set.

---

## Step 7 — Service

`server/services/learningPathAI/learningPathAI.service.ts`:

```ts
class LearningPathService {
  private graph = buildLearningPathGraph();

  async getForCourse(studentId: string, courseId: string) {
    return learningPathRepository.findByStudentCourse(studentId, courseId);
  }

  async regenerate(studentId: string, courseId: string) {
    return traced({ name: "learning-path", tags: ["feature:learning-path"], metadata: { studentId, courseId } }, async () => {
      const result = await this.graph.invoke({ studentId, courseId });
      return learningPathRepository.upsertPath({
        studentId, courseId,
        steps: result.finalSteps,
        summary: result.summary,
        weakConcepts: result.weakConcepts.map(w => w.concept),
        model: "gpt-4o-mini",
      });
    });
  }
}
```

Rate limiting: in-process token bucket keyed by `${studentId}:${courseId}`, 1 token / 60s.

---

## Step 8 — tRPC + SSE

`server/api/routers/learningPath.ts`:

```ts
export const learningPathRouter = createTRPCRouter({
  getForCourse: studentProcedure
    .input(z.object({ courseId: z.string() }))
    .query(({ ctx, input }) =>
      learningPathService.getForCourse(ctx.session.user.id, input.courseId)),

  regenerate: studentProcedure
    .input(z.object({ courseId: z.string() }))
    .mutation(({ ctx, input }) =>
      learningPathService.regenerate(ctx.session.user.id, input.courseId)),
});
```

Compose into `server/api/root.ts`.

`app/api/chat/learning-path/route.ts` — streams node-transition progress (mirrors `app/api/chat/lesson/route.ts`). Each `addNode` emits a `data: { node: "loadStudentSignal" }\n\n` SSE chunk; final event carries the persisted result.

---

## Step 9 — Invalidation hooks

`server/services/lesson/lesson.service.ts` — at the end of `markLessonComplete` and `markLessonIncomplete`:

```ts
void learningPathRepository
  .markStale(studentId, lesson.section.courseId)
  .catch(err => logger.warn({ err, studentId, lessonId }, "markStale failed"));
```

`server/services/quiz/quiz.service.ts` — same pattern at the end of `submit`, looking up courseId via `quiz.lesson.section.courseId`.

---

## Step 10 — UI

```
app/_components/Course/components/LearningPathCard/
  LearningPathCard.tsx
  components/
    PathStepRow.tsx
    RegenerateButton.tsx
    StaleBanner.tsx
    EmptyStateCard.tsx
    WeakConceptChips.tsx
```

`LearningPathCard.tsx`:

```tsx
"use client";
export function LearningPathCard({ courseId }: { courseId: string }) {
  const { data, refetch } = api.learningPath.getForCourse.useQuery({ courseId });
  if (!data) return <EmptyStateCard courseId={courseId} onGenerated={refetch} />;
  return (
    <div className="rounded-lg border p-4">
      {data.staleAt && <StaleBanner />}
      <p className="text-sm">{data.summary}</p>
      <WeakConceptChips concepts={data.weakConcepts as string[]} />
      <ul className="mt-3 space-y-2">
        {(data.steps as PathStep[]).map((s, i) => <PathStepRow key={i} step={s} courseId={courseId} />)}
      </ul>
      <RegenerateButton courseId={courseId} onDone={refetch} />
    </div>
  );
}
```

`RegenerateButton` consumes the SSE stream via `EventSource`; emits progress strings to the parent for the loading state.

Mount on the course player page (top of the curriculum sidebar).

---

## Step 11 — End-to-end

1. Seed: enroll a student, mark 2 lessons complete, submit 1 wrong quiz answer.
2. Click "Generate path" — verify 3–5 steps appear, mix of NEW/REVIEW/RETRY.
3. Mark another lesson complete — verify the stale badge appears.
4. Click "Regenerate" — verify the path refreshes and the badge disappears.
5. Check LangSmith for one run with 6 child spans, one of which is `mergeAndExplain` with the tool calls inline.