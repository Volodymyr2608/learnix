# Spec: Student Dashboard — Real Data

> Requirements in [`requirements.md`](./requirements.md) · plan in [`plan.md`](./plan.md) · checks in [`validation.md`](./validation.md)

## Approach (overview)

Mirror the existing instructor-dashboard data pattern (`instructor.getDashboardStats`)
for the student surface. The `student` tRPC router and `StudentService` **already exist**
(created by the merged student-progress feature, which added `getProgressStats`); this
feature **extends** them with two more `studentProcedure` queries — `getDashboardStats`
and `getContinueLearning` — backed by new aggregation methods on the existing
`enrollmentRepository`, `lessonProgressRepository`, and `lessonRepository`. The Server
Component `app/dashboard/page.tsx` fetches both (alongside the already-dynamic
recommendations) via thin `lib/requests/student/*` wrappers that degrade to empty values
on failure. All period-over-period maths reuse the existing `getMonthWindows` +
`computeDelta` helpers and the `StatDelta` type (already relocated to
`lib/stats/statDelta.ts`), so the student cards behave identically to the instructor cards.

No structural moves are required: `StatDelta` already lives in `lib/stats/statDelta.ts`
and the instructor module already re-exports it; `enrollmentRepository.getStudentCompletionStats`
(certificates total + month buckets) and `lessonProgressRepository.findCompletedIds`
(for next-lesson resolution) already exist and are reused as-is.

The chosen trade-off: reuse the proven instructor/progress stack (extend the existing
router + service, add repository methods) rather than inlining queries in the page. It
adds a small amount of surface but keeps authz, testing, and the three-layer convention
consistent. Rejected alternative: querying Prisma directly in the RSC — faster to write
but bypasses `studentProcedure` gating, has no unit-test seam, and breaks the project's
layering rule.

## Architectural decisions referenced

- **Three-layer pattern (CLAUDE.md):** router → service → repository; aggregation lives in
  repositories, composition in the service, transport/authz in the router.
- **Procedure-level role gating (`server/api/trpc.ts`):** the two queries use
  `studentProcedure`; the student id comes from `ctx.session.user.id`, never from input.
- **Component conventions (CLAUDE.md):** colocated `types.ts`, extracted sub-components,
  no nested ternaries in JSX, flattened/early-return rendering.
- No new ADR is warranted — this feature introduces no new architectural concept; it
  follows the instructor-dashboard precedent (`docs/specs/2026-06-16-instructor-dashboard-data`).

## Data model

No schema changes. The feature reads existing tables only:

- `Enrollment` — `status`, `progress`, `enrolledAt`, `completedAt`, `lastAccessedAt`,
  `studentId`, `courseId`.
- `LessonProgress` — `isCompleted`, `completedAt`, `studentId`, `lessonId`.
- `Section` / `Lesson` — `order`, `deletedAt`, `durationMinutes` (next incomplete lesson +
  Hours Learned).
- `Course` — `title`, `deletedAt` (for Continue Learning display + filtering).

Derived definitions (per requirements):

- **Certificates earned** = `COUNT(Enrollment WHERE studentId = ? AND completedAt IS NOT NULL)`.
  (Already provided by `enrollmentRepository.getStudentCompletionStats`.)
- **Hours learned** = `SUM(Lesson.durationMinutes)` over the student's completed lessons
  (`LessonProgress.isCompleted = true`), formatted to hours by the UI; null
  `durationMinutes` contributes 0.
- **Enrolled courses** = `COUNT(Enrollment WHERE studentId = ? AND status = 'active')`.
- **Completion rate** = `round( completedEnrollments / totalEnrollments * 100 )`, where
  `completedEnrollments = COUNT(completedAt IS NOT NULL)` and `totalEnrollments = COUNT(*)`
  for the student; `0%` when `totalEnrollments = 0`. `getStudentEnrollmentStats` returns
  `totalEnrollments` as the denominator (the `active` count alone is not enough).
- Deltas bucket the three trend metrics into this-month vs last-month windows from
  `getMonthWindows()`: Enrolled Courses by `enrolledAt`, Certificates by
  `Enrollment.completedAt`, and Hours Learned by summing `durationMinutes` for lessons
  whose `LessonProgress.completedAt` falls in each window. (The existing
  `getCompletedMinutesTotals` is trailing-7-day for the progress page; the dashboard uses
  a new month-bucketed minutes sum — see `getStudentLessonStats` below.)
- **Next incomplete lesson** for a course = the lesson with the lowest `(Section.order,
  Lesson.order)` among non-deleted lessons in non-deleted sections that has no
  `LessonProgress.isCompleted = true` row for the student.

## API & contracts

| Procedure / route | Type / auth | Input → Output | Notes |
|-------------------|-------------|----------------|-------|
| `student.getDashboardStats` | `studentProcedure` | `void` → `StudentDashboardStats` | Read-only; scoped to `ctx.session.user.id`; aggregates run concurrently. |
| `student.getContinueLearning` | `studentProcedure` | `void` → `ContinueLearningItem[]` | Read-only; ≤3 in-progress courses ordered by `lastAccessedAt` desc; each carries the next-lesson deep-link target. |

New entity types — `server/entities/student/dashboard.ts`:

```ts
import type { StatDelta } from "@/lib/stats/statDelta";

/** Data for the four student dashboard stat cards. */
export type StudentDashboardStats = {
  enrolledCourses: { total: number; delta: StatDelta };
  hoursLearned: { totalMinutes: number; delta: StatDelta }; // UI formats minutes → hours (FR3/FR4)
  certificates: { total: number; delta: StatDelta };
  completionRate: { percent: number }; // 0..100, no delta (FR7 / decision #5)
};

/** One row of the "Continue Learning" list. */
export type ContinueLearningItem = {
  courseId: string;
  courseTitle: string;
  progress: number;        // 0..100 (exclusive of both ends per FR10)
  nextLessonId: string;    // target of the resume deep-link (FR12)
  nextLessonTitle: string; // FR11
};
```

`StatDelta` is reused unchanged (`{ kind: "percent"; value; direction } | { kind: "new" }
| { kind: "none" }`); `DeltaBadge`'s existing rendering already covers all three cases.

## Component / data flow

```
app/dashboard/page.tsx (RSC)
  └─ Promise.all([
       getStudentDashboardStats(),   lib/requests/student/getDashboardStats.ts ─┐
       getContinueLearning(),        lib/requests/student/getContinueLearning.ts ┤ degrade to
       getRecommendations()          (existing, unchanged)                       │ empty on error
     ])                                                                          │
        │                                                                        │
        ▼ api.student.*  (studentProcedure, id from session) ────────────────────┘
   StudentService.getDashboardStats(studentId)
     └─ Promise.all([
          enrollmentRepository.getStudentEnrollmentStats(studentId)   → enrolled active + total + enrolledAt buckets
          enrollmentRepository.getStudentCompletionStats(studentId)   → certs total + completedAt buckets (EXISTS)
          lessonProgressRepository.getStudentLessonStats(studentId)   → lifetime minutes + completedAt month buckets
        ])
        └─ computeDelta(thisMonth, lastMonth) per trend metric → StudentDashboardStats
           (completionRate = completed/total from getStudentEnrollmentStats; no delta)
   StudentService.getContinueLearning(studentId, limit=3)
     ├─ enrollmentRepository.findInProgressForContinue(studentId, 3)  → enrollments+course
     ├─ lessonRepository.findOrderedLessonIdsByCourseIds(courseIds)   → ordered lessons
     └─ lessonProgressRepository.findCompletedIds(studentId, lessonIds)
        └─ resolve first incomplete lesson per course → ContinueLearningItem[]
                                                          (drop a course with no incomplete lesson)

Render (page):
  <DashboardStatsCards stats={stats} />     ← four StatCards + DeltaBadge (Completion Rate: static subline)
  <ContinueLearning items={items} />        ← list of resume links OR empty state (FR13)
  <RecommendedRail courses={recs} />        ← unchanged
```

Bounded query count for Continue Learning: 1 (enrollments) + 1 (ordered lessons for ≤3
courses) + 1 (completed ids) — no per-course N+1.

## File list

**New**
- `server/entities/student/dashboard.ts` — `StudentDashboardStats`, `ContinueLearningItem`.
  (Sibling to the existing `server/entities/student/progress.ts`.)
- `lib/requests/student/getDashboardStats.ts` — RSC wrapper; degrades to zeroed stats.
- `lib/requests/student/getContinueLearning.ts` — RSC wrapper; degrades to `[]`.
- `app/_components/Dashboard/StatsCards/index.tsx` + `types.ts` — student stat cards
  (Enrolled Courses, Hours Learned, Certificates, Completion Rate), reusing the
  `DeltaBadge`/`StatCard` shape from the instructor cards.
- `app/_components/Dashboard/ContinueLearning/index.tsx` + `types.ts` — in-progress list
  with resume links and an empty state.

**Modified** (these already exist from the student-progress feature)
- `server/services/student/student.service.ts` — add `getDashboardStats` and
  `getContinueLearning` to the existing `StudentService`; compose repositories, apply
  `computeDelta`, resolve next lesson, log with the student id.
- `server/services/student/student.service.test.ts` — extend with cases for delta wiring,
  completion-rate maths, zero-data, and next-lesson resolution.
- `server/api/routers/student.ts` — add the two `studentProcedure` queries to the existing
  `studentRouter` (already registered in `root.ts`).
- `server/repositories/enrollment.repository.ts` — add `getStudentEnrollmentStats`
  (active count + total denominator + `enrolledAt` month buckets) and
  `findInProgressForContinue`. (`getStudentCompletionStats` already exists — reused.)
- `server/repositories/lessonProgress.repository.ts` — add `getStudentLessonStats`
  (lifetime minutes + `completedAt` month buckets, summing `Lesson.durationMinutes` via
  `getMonthWindows`). (`findCompletedIds` already exists — reused for next-lesson.)
- `server/repositories/lesson.repository.ts` — add `findOrderedLessonIdsByCourseIds`
  (ordered by `Section.order`, `Lesson.order`, non-deleted).
- `app/dashboard/page.tsx` — fetch real data; render `<DashboardStatsCards>` and
  `<ContinueLearning>` in place of the hardcoded markup; keep `<RecommendedRail>`.

**Already in place (no change needed)**
- `lib/stats/statDelta.ts` — `StatDelta` already lives here; `server/entities/instructor/dashboard.ts`
  and `lib/stats/computeDelta.ts` already import from it. No relocation required.
- `server/api/root.ts` — `student` router already registered.

## Cross-cutting concerns

- **Security / authz:** both queries are `studentProcedure`; every repository method takes
  `studentId` sourced from `ctx.session.user.id`. No student id is accepted from input, so
  there is no IDOR surface. Continue Learning only ever returns the caller's own courses.
- **Error handling:** the RSC request wrappers catch and log, returning zeroed stats / `[]`
  so a transient failure renders an empty-but-valid dashboard rather than crashing the page
  (matches the instructor wrappers).
- **Empty / zero data:** `computeDelta` already returns `{ kind: "none" }` when the prior
  period is 0 and current is 0 (delta hidden), and `{ kind: "new" }` when prior 0 / current
  > 0; Completion Rate renders `0%` with a static subline; Continue Learning shows the
  empty state when the list is empty.
- **Observability:** `StudentService` logs each aggregation with the student id, matching
  `InstructorService` logging.
- **Performance:** stats aggregates run via `Promise.all`; Continue Learning is bounded to
  3 courses resolved in 3 queries total (no N+1). Counts use indexed columns
  (`LessonProgress @@index([studentId])`, `Enrollment @@index([studentId])`).

## Risks & mitigations

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| A course in Continue Learning has every lesson completed but `progress < 100` (stale rollup) → no next lesson | L / L | The `0 < progress < 100` filter already excludes most; if no incomplete lesson resolves, the service drops that row rather than emitting a broken link. |
| `Lesson.durationMinutes` is null for many lessons → Hours Learned undercounts | M / L | Accepted per requirements: nulls count as 0; degrades gracefully and self-corrects as instructors fill durations. |
| Completion-rate denominator includes inactive/old enrollments, skewing the figure | L / L | Decision #4/FR7 define it over all the student's enrollments; documented and consistent. |

## Rollout / migration

- No env vars, no database migration, no backfill.
- Pure additive code change; revert by restoring the previous `app/dashboard/page.tsx` and
  removing the new files plus the added methods on the existing `StudentService` /
  repositories. No shared-type relocation is involved.