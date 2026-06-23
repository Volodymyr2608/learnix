# Spec: Student Progress Page — Real Data

> Requirements in [`requirements.md`](./requirements.md) · plan in [`plan.md`](./plan.md) · checks in [`validation.md`](./validation.md)

## Approach (overview)

Make the five time/count widgets real by (1) replacing the free-text **lesson** duration
with a numeric `Lesson.durationMinutes`, and (2) deriving every metric from the student's
completed lessons, bucketed by `LessonProgress.completedAt`. A new `student` tRPC router
exposes a single `studentProcedure` query, `getProgressStats`, backed by a new
`StudentService` that composes aggregation methods on the existing `lessonProgress` and
`enrollment` repositories. The Server Component `app/dashboard/progress/page.tsx` fetches
it once via a `lib/requests/student/getProgressStats.ts` wrapper that degrades to zeroed
values on failure.

This feature establishes the shared `student` router/service and the stat helpers the
paused **student-dashboard** spec will reuse — in particular `formatDuration`,
`getWeekWindows`, the relocated `StatDelta`, and the completed-lesson "hours" aggregation
(the dashboard's deferred "Hours Learned" can later be built on the same query).

Chosen trade-off: a structural migration (drop free-text lesson duration → numeric minutes)
in exchange for a single numeric source of truth and honest, summable hours. The riskiest
slice is the AI course builder, which currently emits lesson `duration` as a string;
isolating and updating that path (schema, prompt, validators, coherence tool) is the
crux of the change. Rejected alternative: keeping the free-text field and adding a second
numeric column — avoids touching the AI builder but leaves two duration fields to keep in
sync, which decision #4 in requirements explicitly rules out.

## Architectural decisions referenced

- **Three-layer pattern (CLAUDE.md):** router → service → repository; aggregation in
  repositories, composition + streak/daily-fill logic in the service, transport/authz in
  the router.
- **Procedure-level role gating (`server/api/trpc.ts`):** `getProgressStats` uses
  `studentProcedure`; student id from `ctx.session.user.id`, never from input.
- **LangGraph course builder (ADR-016):** the curriculum extraction schema, prompt,
  validators, and `validateCurriculumCoherence` tool are the contract for AI-generated
  lessons; the lesson-duration type change must be applied across all of them so generated
  curricula still validate and persist.
- **Component conventions (CLAUDE.md):** colocated `types.ts`, extracted sub-components,
  no nested ternaries, flattened/early-return rendering.
- No new ADR warranted — this follows the instructor/student dashboard data precedent.

## Data model

### `prisma/schema/lesson.prisma` (modified)

```prisma
model Lesson {
  id       String  @id @default(cuid())
  title    String
  // duration String?              ← removed (free-text)
  durationMinutes Int? @map("duration_minutes") // numeric lesson length; null = unknown

  // …unchanged…
}
```

Only the **lesson** duration changes. `Course.duration` (basic-step course length, e.g.
"6 weeks", `server/entities/course/index.ts:49`) stays a free-text `String` and is **out
of scope**.

**Migration ordering (data-preserving, three steps):**

1. Migration A — add nullable `durationMinutes Int?` (keep `duration` for now).
2. Backfill script `scripts/backfill-lesson-duration.ts` — parse each lesson's free-text
   `duration` (`"45"`, `"10 min"`, `"1h 30m"`, `"1.5 hours"`, `"1 week"`→null, etc.) into
   minutes; unparseable / non-lesson-scale values → leave `null`. Idempotent (only sets
   rows where `durationMinutes IS NULL`).
3. Migration B — drop the `duration` column.

A lesson with `durationMinutes = null` contributes `0` to all hour sums (handled with
`COALESCE` in the aggregation queries).

## API & contracts

| Procedure / route | Type / auth | Input → Output | Notes |
|-------------------|-------------|----------------|-------|
| `student.getProgressStats` | `studentProcedure` | `void` → `StudentProgressStats` | Read-only; scoped to `ctx.session.user.id`; aggregates run concurrently. |

New entity types — `server/entities/student/progress.ts`:

```ts
import type { StatDelta } from "@/lib/stats/statDelta";

/** One day in the trailing-7-day Weekly Activity chart (FR7). */
export type WeeklyActivityDay = {
  date: string;     // ISO calendar day (server local)
  weekday: string;  // "Mon".."Sun"
  minutes: number;  // total duration of lessons completed that day (0 if none)
};

/** Everything the progress page renders (FR1–FR7). */
export type StudentProgressStats = {
  totalMinutes: number;            // lifetime; formatted to hours in UI (FR1)
  totalHoursDelta: StatDelta;      // trailing 7d vs prior 7d (FR2)
  coursesCompleted: { total: number; delta: StatDelta }; // month-over-month (FR3/FR4)
  currentStreakDays: number;       // FR5
  avgDailyMinutes: number;         // mean of weeklyActivity minutes (FR6)
  weeklyActivity: WeeklyActivityDay[]; // exactly 7 entries, oldest→newest (FR7)
};
```

## Component / data flow

```
app/dashboard/progress/page.tsx (RSC)
  └─ getProgressStats()   lib/requests/student/getProgressStats.ts  (degrade to EMPTY on error)
        │
        ▼ api.student.getProgressStats   (studentProcedure, id from session)
   StudentService.getProgressStats(studentId)
     └─ Promise.all([
          lessonProgressRepository.getCompletedMinutesTotals(studentId)   → lifetime + 7d/prior-7d
          lessonProgressRepository.getDailyCompletedMinutes(studentId, 7) → minutes per day (raw)
          lessonProgressRepository.getCompletionDays(studentId)           → distinct completion days
          enrollmentRepository.getStudentCompletionStats(studentId)       → completed + month buckets
        ])
        ├─ computeDelta(thisWeek, priorWeek)  → totalHoursDelta
        ├─ computeDelta(thisMonth, lastMonth) → coursesCompleted.delta
        ├─ fill 7-day window (zero-fill missing days, label weekday) → weeklyActivity
        ├─ avgDailyMinutes = mean(weeklyActivity.minutes)
        └─ currentStreakDays = count consecutive days ending today/yesterday in completionDays

Render (page):
  <ProgressStatsCards stats={stats} />   ← 4 StatCards (Total Hours, Courses Completed, Streak, Avg Daily)
  <WeeklyActivity days={stats.weeklyActivity} />  ← 7 bars, zero bars still rendered
  <Achievements /> / <SkillProgress />   ← unchanged static (deferred, decision #2)
```

Window helpers: `getMonthWindows` (existing) for courses-completed; new
`getWeekWindows(now)` → `{ startThisWeek, startPriorWeek, startNextDay }` (trailing 7-day,
not calendar week) for hours delta and the chart range.

## File list

**New**
- `lib/stats/statDelta.ts` — neutral home for `StatDelta` (moved from
  `server/entities/instructor/dashboard.ts`).
- `lib/stats/getWeekWindows.ts` — trailing-7-day boundaries (server local time).
- `lib/format/formatDuration.ts` — `minutes → "Xh Ym" | "X min"` for display; reusable.
- `server/entities/student/progress.ts` — `StudentProgressStats`, `WeeklyActivityDay`.
- `server/services/student/student.service.ts` — `StudentService.getProgressStats`;
  composes repos, applies `computeDelta`, zero-fills the week, computes the streak, logs
  with the student id.
- `server/services/student/student.service.test.ts` — unit tests (mocked repos): delta
  wiring, zero-fill, streak edge cases (today/yesterday boundary, gaps), zero-data.
- `server/api/routers/student.ts` — `studentRouter` with `getProgressStats`.
- `lib/requests/student/getProgressStats.ts` — RSC wrapper; degrades to zeroed stats.
- `scripts/backfill-lesson-duration.ts` — best-effort free-text → minutes backfill.
- `lib/parse/parseLessonDuration.ts` — shared parser used by the backfill (and unit-tested).
- `app/_components/Dashboard/Progress/ProgressStatsCards/index.tsx` + `types.ts` — four
  stat cards, reusing the `DeltaBadge`/`StatCard` shape.
- `app/_components/Dashboard/Progress/WeeklyActivity/index.tsx` + `types.ts` — 7-bar chart
  with zero bars + empty handling.

**Modified**
- `prisma/schema/lesson.prisma` — `duration String?` → `durationMinutes Int?` (+ 2 migrations).
- `server/entities/lesson/index.ts` — lesson `duration` → `durationMinutes` (number, nullable).
- `server/entities/course/index.ts` — curriculum lesson `duration` field → `durationMinutes`
  (the **course** `duration` at line 49 is left untouched).
- `server/entities/instructor/dashboard.ts` — re-export `StatDelta` from `lib/stats/statDelta`.
- `lib/stats/computeDelta.ts` — import `StatDelta` from its new sibling.
- `server/services/courseAI/validators/getExtractionSchemaForStep.ts` — curriculum lesson
  `duration: z.string().optional()` → `durationMinutes: z.number().int().optional()`
  (the basic-step course `duration` at line 16 is left untouched).
- `server/services/courseAI/prompts/extractStepDataPrompt.ts` — curriculum template +
  guidance to emit `durationMinutes` (number); basic-step course duration unchanged.
- `server/services/courseAI/validators/getValidatorForStep.ts` — curriculum lesson
  duration field rename.
- `server/services/courseAI/tools/validateCurriculumCoherence.ts` — lesson schema
  `duration` → `durationMinutes` (number).
- `server/repositories/lessonProgress.repository.ts` — add `getCompletedMinutesTotals`,
  `getDailyCompletedMinutes`, `getCompletionDays` (join `Lesson`, `COALESCE(duration_minutes,0)`).
- `server/repositories/enrollment.repository.ts` — add `getStudentCompletionStats`
  (completed total + month buckets via `getMonthWindows`).
- `server/api/root.ts` — register `student` router.
- `app/_components/Course/components/FormCards/CurriculumForm/**` + `useCourseForm.ts` —
  capture `durationMinutes` (number input) instead of free-text.
- `app/_components/Course/components/Lesson/LessonContentEditor/**` (`types.ts`,
  `useLessonForm.ts`, `useLessonEditor.ts`) — numeric duration field.
- `app/_components/Course/components/AIChatBuilderDialog/components/Preview/Cards/CurriculumCard/index.tsx`
  — render `formatDuration(lesson.durationMinutes)` instead of the raw string.
- `app/dashboard/progress/page.tsx` — Server Component; fetch real data; render
  `<ProgressStatsCards>` + `<WeeklyActivity>`; keep Achievements/Skill Progress static.

## Cross-cutting concerns

- **Security / authz:** `studentProcedure`; every repository method takes `studentId` from
  `ctx.session.user.id`. No id from input → no IDOR surface.
- **Error handling:** the RSC wrapper catches and logs, returning zeroed stats so a
  transient failure renders an empty-but-valid page instead of crashing.
- **Empty / zero data:** `computeDelta` hides the delta when both periods are 0; streak is
  `0` with no completion days; `avgDailyMinutes` is `0` when the week is empty; the chart
  always renders 7 (possibly zero) bars.
- **Migration safety:** add-column → backfill → drop-column ordering means no data loss and
  the app keeps building between steps; the backfill is idempotent and the parser is
  unit-tested against the known free-text formats.
- **AI builder integrity:** after the rename, generated curricula must still validate;
  covered by re-running the course-builder evals (`pnpm eval courseAI:*`) before merge per
  CLAUDE.md.
- **Observability:** `StudentService` logs each aggregation with the student id.
- **Performance:** one endpoint; four aggregates via `Promise.all`; daily/total minutes and
  completion days computed in SQL (grouped), no N+1 over lessons.

## Risks & mitigations

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| AI builder emits/expects the old string `duration`, breaking generation | M / H | Update schema + prompt + validators + coherence tool together; re-run `courseAI` evals; the relaxed extraction schema means a missing field is optional, not fatal. |
| Free-text durations parse poorly → understated hours | M / M | Best-effort parser unit-tested on real formats; unparseable → null/0 (never an error); hours are explicitly "content completed", not audited time. |
| `duration` referenced somewhere not enumerated | L / M | `pnpm typecheck` after the rename surfaces every remaining reference; grep audit in validation. |
| Streak off-by-one around the today/yesterday boundary | M / L | Streak rule pinned in the service + covered by unit tests for the boundary cases. |
| Dashboard spec assumes it creates the `student` router/service/`StatDelta` move | M / L | This feature creates them first; the paused dashboard spec is updated to "reuse" before its plan is written (noted below). |

## Rollout / migration

- No env vars. Two Prisma migrations (add column; drop column) with a backfill script run
  between them: `pnpm db:generate` → run `scripts/backfill-lesson-duration.ts` → second
  migration. `pnpm generate` regenerates the Prisma client + `prisma/zod` types.
- Re-run `pnpm eval courseAI:*` before merge to confirm AI curriculum generation still
  validates with numeric durations.
- Revert: restore `duration String?`, re-add it as a column, and restore the page — the
  numeric column is additive until migration B, so a mid-rollout abort is safe.
- **Cross-feature note:** the paused `2026-06-17-student-dashboard-data/spec.md` currently
  lists the `student` router/service and the `StatDelta` relocation as *new*; when we return
  to it, update it to *reuse* the foundations this feature introduces.