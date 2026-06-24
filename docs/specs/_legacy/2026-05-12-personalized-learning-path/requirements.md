# Requirements: Personalized Learning Path Agent

## Status: planned — Phase 10

## Problem

Enrolled students see a flat curriculum: sections and lessons in the order the instructor arranged them. They have no answer to "what should I do next given how I'm actually doing?". The platform already collects strong learning signal — `LessonProgress`, `QuizAttempt`, `ConceptMastery`, `LessonInsights.concepts` — but nothing reads it back to the student as a recommendation.

The existing AI features (`lessonAI`, `quizAI`, `lessonInsightsAI`) are all single-turn ReAct agents built on `createAgent`. They are a good fit for one-shot Q&A but not for a recommendation that requires (a) deterministic filtering of student signal, (b) a hard branch between "review weak material" vs "advance", and (c) a bounded self-correction loop.

## Goal

A per-course "Your Path" widget on the course player page. The student clicks **Regenerate** (or sees it auto-recompute when stale) and gets 3–5 ordered next steps — a mix of new lessons, lesson reviews, and quiz retries — each with a short reason grounded in their own progress data.

## Architectural decisions

- **ADR-008** — agent + tools + structured output; semantic validation with bounded retries.
- **ADR-004** — `studentProcedure` enforces role at the tRPC layer.
- **ADR-006** — SSE streaming for the regenerate flow (per-node progress updates).
- **ADR-010** — typed domain errors mapped to tRPC errors.
- **ADR-011** — component folder architecture for `LearningPathCard`.
- **ADR-013** — every graph run is traced with `feature:learning-path`; per-node child spans.
- **New decision (this spec):** use `@langchain/langgraph` directly as a `StateGraph` rather than `createAgent`. Rationale below.

### Why LangGraph (not `createAgent`)

The graph has two LLM nodes (`mergeAndExplain`, `reflectAndCheck`) and four deterministic nodes (`loadStudentSignal`, `identifyWeakSignals`, `proposeReviews`, `proposeNewLessons`). Forcing the deterministic steps through an agent loop would:
- waste tokens (filtering completed lessons is a Prisma query, not a model decision),
- make the strategy branch (`weak vs ready`) a tool-call guess instead of an `if`,
- make the reflection retry loop awkward (it is a graph edge with a bounded counter in state).

`@langchain/langgraph` is already a transitive dependency via `createAgent` and was added as a direct dependency in commit `bf6f25b`.

## Functional requirements

| Surface | Behaviour |
|---|---|
| Course player page | New "Your Path" card at the top of the curriculum sidebar. |
| First-time state | No cache row → CTA card "Get your personalised path" with a single button. No auto-generation on enrollment. |
| Generated state | 3–5 step rows + 1–2 sentence summary + weak-concept chips + "Generated Nh ago" + Regenerate button. |
| Stale state | Cache row with `staleAt != null` → same card with a "stale" badge; click Regenerate to refresh. |
| Step row | Icon (▶ new, ⟲ review, ⟲ retry-quiz), lesson title, one-sentence reason. Whole row is a deep link. |
| Regenerate flow | SSE; per-node progress strings ("Analyzing your progress…", "Picking next lessons…", "Writing reasoning…"). |
| Rate limit | 1 regeneration per (student, course) per 60s. In-process token bucket. |
| Trigger from data changes | Quiz attempt or lesson completion sets `staleAt = now()`; does not auto-regenerate. |
| Persistence | One cache row per (student, course); overwritten on regeneration. Audit trail = `generatedAt` timestamp. |

## Graph architecture

```
                  ┌────────────────────┐
                  │  loadStudentSignal │   deterministic — Prisma reads
                  └─────────┬──────────┘
                            │ enrollment, progress, mastery, quiz attempts
                  ┌─────────▼──────────┐
                  │ identifyWeakSignals│   deterministic — filter
                  └─────────┬──────────┘
                            │
                  ┌─────────▼──────────┐
                  │   decideStrategy   │   conditional edge (no LLM)
                  └────┬──────────┬────┘
                       │          │
            has weak   │          │   none weak
                       ▼          ▼
              ┌────────────┐  ┌──────────────────┐
              │proposeReviews│ │ proposeNewLessons│
              └──────┬─────┘  └────────┬─────────┘
                     └────┬─────┬──────┘
                          ▼     ▼
                     ┌──────────────────┐
                     │  mergeAndExplain │   ◄── LLM call (gpt-4o-mini, temp 0.3)
                     │  + structured out│       may call tools below
                     └────────┬─────────┘
                              │
                     ┌────────▼─────────┐
                     │  reflectAndCheck │   ◄── LLM critic (max 2 attempts)
                     └────┬─────────┬───┘
                          │OK       │needs fix → back to mergeAndExplain
                          ▼
                     ┌──────────────────┐
                     │ persist + return │
                     └──────────────────┘
```

**Short-circuit:** if the student has zero completed lessons and zero quiz attempts, `decideStrategy` skips both LLM nodes and returns the first three lessons in `order` with canned reasoning. No tokens spent.

## State and output schemas

**Graph state (in-memory during run):**

```ts
type PathState = {
  studentId: string;
  courseId: string;

  // populated by loadStudentSignal
  completedLessonIds: string[];
  lessonOrder: {
    id: string;
    sectionOrder: number;
    lessonOrder: number;
    concepts: string[];
  }[];
  quizAttempts: { quizId: string; lessonId: string; isCorrect: boolean; attemptedAt: Date }[]; // last attempt per (student, quiz)
  mastery: { concept: string; level: number }[];

  // populated by identifyWeakSignals
  weakConcepts: { concept: string; level: number; firstLessonId: string }[];
  failedQuizzes: { lessonId: string; quizId: string }[];

  // populated by proposeReviews / proposeNewLessons
  candidateSteps: DraftStep[];

  // populated by mergeAndExplain
  finalSteps: PathStep[];
  summary: string;

  // reflection bookkeeping
  reflectionAttempt: number; // 0..2
  reflectionFeedback?: string;
};
```

**Output schema (returned by tRPC, persisted to cache):**

```ts
const PathStepSchema = z.object({
  type: z.enum(["NEW_LESSON", "REVIEW_LESSON", "RETRY_QUIZ"]),
  lessonId: z.string(),
  quizId: z.string().optional(),  // only for RETRY_QUIZ
  title: z.string(),              // denormalised lesson title
  reason: z.string().min(20),
});

const LearningPathSchema = z.object({
  steps: z.array(PathStepSchema).min(1).max(5),
  summary: z.string().min(20),
  weakConcepts: z.array(z.string()).max(8),
});
```

**Semantic validator** (re-prompts on failure, max 3 attempts, per ADR-008):
- Every `lessonId` must belong to this course.
- `NEW_LESSON.lessonId` must NOT be in `completedLessonIds`.
- `REVIEW_LESSON.lessonId` MUST be in `completedLessonIds`.
- `RETRY_QUIZ.quizId` must reference a quiz the student has failed at least once.

## Definition: "weak concept"

A concept is weak if either:
- `ConceptMastery.level < 3` (on the 0–5 scale used by `markConceptUnderstood` tool), or
- The concept appears in `LessonInsights.concepts` for a lesson whose quiz the student has failed at least once.

## Tools (used only by `mergeAndExplain`)

| Tool | Inputs | Output |
|---|---|---|
| `get_lesson_summary` | `lessonId` | `{ summary, concepts[], glossary }` from `LessonInsights`. Returns `null` if not yet generated. |
| `get_quiz_attempt_history` | `lessonId` | Last 5 attempts on quizzes in that lesson with `isCorrect`. |

The deterministic nodes do not use tools — they call repositories directly.

## Persistence and invalidation

**New Prisma model** in `prisma/schema/course.prisma` (lives near other course-scoped data):

```prisma
model LearningPathCache {
  id           String   @id @default(cuid())
  studentId    String
  courseId     String
  steps        Json     // PathStep[]
  summary      String   @db.Text
  weakConcepts Json     // string[]
  model        String   // "gpt-4o-mini"
  generatedAt  DateTime @default(now())
  staleAt      DateTime?

  student User   @relation(fields: [studentId], references: [id], onDelete: Cascade)
  course  Course @relation(fields: [courseId], references: [id], onDelete: Cascade)

  @@unique([studentId, courseId])
  @@map("learning_path_cache")
}
```

**Invalidation hooks** (fire-and-forget, `.catch` logged — same pattern as embeddings):
- `QuizService.submit` → look up `courseId` from `quiz.lesson.section.course`, then `learningPathRepository.markStale(studentId, courseId)`.
- `LessonService.markLessonComplete` and `LessonService.markLessonIncomplete` → look up `courseId` from the lesson's section, then `markStale`.

Both hooks derive `courseId` because the existing service methods only take `lessonId`/`quizId` + `studentId`. The lookup is a single Prisma query that piggybacks on data already fetched.

**Repository:** `LearningPathRepository extends BaseRepository<LearningPathCache>`, using the `upsert` method added in commit `96f21be`. Methods: `findByStudentCourse`, `markStale(studentId, courseId)`, `upsertPath(...)`.

## tRPC surface

New router `learningPath` (`server/api/routers/learningPath.ts`), composed into `root.ts`.

| Procedure | Type | Behaviour |
|---|---|---|
| `getForCourse({ courseId })` | `studentProcedure` | Reads cache row. Returns `{ steps, summary, weakConcepts, generatedAt, isStale } \| null`. Cheap; called on every course page render. |
| `regenerate({ courseId })` | `studentProcedure` | Rate-limited 1/60s per (student, course). SSE stream of node-level progress; final event is the persisted path. |

The SSE endpoint lives at `app/api/chat/learning-path/route.ts` to match the existing AI route convention. The tRPC `regenerate` procedure returns the final result for non-streaming callers; the SSE endpoint is what the UI actually consumes.

## Service layer

```
server/services/learningPathAI/
  learningPathAI.service.ts      orchestrates, persists, traces
  learningPathAI.graph.ts        compiles the LangGraph StateGraph
  learningPathAI.errors.ts       typed domain errors
  schemas/
    learningPath.schema.ts       PathStep / LearningPathSchema (zod)
  nodes/
    loadStudentSignal.node.ts
    identifyWeakSignals.node.ts
    decideStrategy.node.ts       conditional edge function
    proposeReviews.node.ts
    proposeNewLessons.node.ts
    mergeAndExplain.node.ts
    reflectAndCheck.node.ts
  tools/
    getLessonSummary.tool.ts
    getQuizAttemptHistory.tool.ts
```

## LangSmith tracing (ADR-013)

The whole run is wrapped with `traced({ name: "learning-path", tags: ["feature:learning-path"], metadata: { studentId, courseId } })`. Each node is a child span — failures show which node broke, the reflection counter is recorded, and the eventual structured output is the trace's `outputs` field.

## UI integration

**Component layout** (per ADR-011):

```
app/_components/Course/components/LearningPathCard/
  LearningPathCard.tsx        container; reads api.learningPath.getForCourse
  components/
    PathStepRow.tsx           one step row (icon by type, title, reason)
    RegenerateButton.tsx      SSE consumer; shows node-level progress
    StaleBanner.tsx
    EmptyStateCard.tsx        first-time CTA
    WeakConceptChips.tsx
```

**Placement:** rendered at the top of the course-player sidebar (above the section/lesson tree). The card occupies its own block — when collapsed it shows just the summary and the "current step" row; when expanded it shows all 3–5 steps.

**Step row click → deep link:**
- `NEW_LESSON` / `REVIEW_LESSON` → navigate to the lesson.
- `RETRY_QUIZ` → navigate to the lesson and scroll the quiz into view (existing `QuizPlayer` deep-link pattern).

## Failure modes

| Failure | Behaviour |
|---|---|
| 0 completed lessons & 0 quiz attempts | `decideStrategy` short-circuits. First three lessons in `order` returned with canned reasoning. No LLM call. |
| No `LessonInsights` exist for the course | `getLessonSummary` returns `null`; agent falls back to `Lesson.description`. Path still generates. |
| OpenAI call fails / 15s timeout | If a cache row exists, return it with `isStale=true` and a "couldn't refresh" banner. If no cache, surface recoverable `LearningPathTransientError` to the UI. |
| Semantic validator fails 3× | Throw `LearningPathInvalidError` → tRPC `INTERNAL_SERVER_ERROR` per ADR-010. LangSmith trace captures the violation. |
| Reflection critic flags issues 2× | Return draft path as-is; mark trace `reflection.skipped=true` for offline eval. |
| Rate limit hit | tRPC `TOO_MANY_REQUESTS`. Button shows countdown. |
| Course unpublished mid-session | `loadStudentSignal` checks `course.deletedAt` and `course.published`; throws `CourseUnavailableError`. |

## Files to create / modify

| Action | Path |
|---|---|
| New Prisma model | `prisma/schema/course.prisma` (`LearningPathCache`) |
| New migration | `prisma/migrations/<ts>_add_learning_path_cache/migration.sql` |
| New repository | `server/repositories/learningPath.repository.ts` |
| New service | `server/services/learningPathAI/learningPathAI.service.ts` |
| New graph | `server/services/learningPathAI/learningPathAI.graph.ts` |
| New nodes | `server/services/learningPathAI/nodes/*.node.ts` (7 files) |
| New tools | `server/services/learningPathAI/tools/getLessonSummary.tool.ts`, `getQuizAttemptHistory.tool.ts` |
| New schemas | `server/services/learningPathAI/schemas/learningPath.schema.ts` |
| New errors | `server/services/learningPathAI/learningPathAI.errors.ts` |
| New router | `server/api/routers/learningPath.ts` |
| Modify | `server/api/root.ts` — register `learningPath` router |
| New SSE route | `app/api/chat/learning-path/route.ts` |
| Modify | `server/services/quiz/quiz.service.ts` — fire-and-forget `markStale` after `submit` |
| Modify | `server/services/lesson/lesson.service.ts` — fire-and-forget `markStale` after `markLessonComplete` / `markLessonIncomplete` |
| New component dir | `app/_components/Course/components/LearningPathCard/` (5 files per layout above) |
| Modify | course player page (`app/dashboard/courses/[courseId]/...`) — mount `LearningPathCard` in sidebar |
| Modify | `docs/specs/roadmap.md` — Phase 10 marked 🔄 |
| Modify | `docs/README.md` — link this spec |

## Estimated effort

| Task | Time |
|---|---|
| Prisma model + migration + repository | 0.5 day |
| Schemas + errors | 0.25 day |
| Deterministic nodes (load, identify, propose×2, decideStrategy) | 1 day |
| LLM nodes (mergeAndExplain, reflectAndCheck) + tools | 1 day |
| Graph wiring + semantic validator + retry | 0.5 day |
| tRPC router + SSE route | 0.5 day |
| Invalidation hooks in quiz/lesson services | 0.25 day |
| UI components (card, rows, regenerate, stale banner, empty state) | 1 day |
| Course page integration + deep-link wiring | 0.5 day |
| LangSmith tracing + manual end-to-end | 0.5 day |
| **Total** | **~6 days** |