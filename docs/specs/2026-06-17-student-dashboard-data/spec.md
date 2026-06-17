# Spec: Student Dashboard — Real Data

> Requirements in [`requirements.md`](./requirements.md) · plan in [`plan.md`](./plan.md) · checks in [`validation.md`](./validation.md)

## Approach (overview)

Mirror the existing instructor-dashboard data pattern (`instructor.getDashboardStats`)
for the student surface. A new `student` tRPC router exposes two `studentProcedure`
queries — `getDashboardStats` and `getContinueLearning` — each backed by a new
`StudentService` that composes aggregation methods on the existing
`enrollmentRepository` and `lessonProgressRepository`. The Server Component
`app/dashboard/page.tsx` fetches both (alongside the already-dynamic recommendations) via
thin `lib/requests/student/*` wrappers that degrade to empty values on failure. All
period-over-period maths reuse the existing `getMonthWindows` + `computeDelta` helpers and
the `StatDelta` type, so the student cards behave identically to the instructor cards.

The only structural change is relocating the shared `StatDelta` type out of
`server/entities/instructor/dashboard.ts` into a neutral home so the student feature can
depend on it without importing from an "instructor" module; the instructor module
re-exports it, leaving existing imports working.

The chosen trade-off: reuse the proven instructor stack (new router + service +
repository methods) rather than inlining queries in the page. It adds a small amount of
surface but keeps authz, testing, and the three-layer convention consistent. Rejected
alternative: querying Prisma directly in the RSC — faster to write but bypasses
`studentProcedure` gating, has no unit-test seam, and breaks the project's layering rule.

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
- `Section` / `Lesson` — `order`, `deletedAt` (to resolve the next incomplete lesson).
- `Course` — `title`, `deletedAt` (for Continue Learning display + filtering).

Derived definitions (per requirements):

- **Certificates earned** = `COUNT(Enrollment WHERE studentId = ? AND completedAt IS NOT NULL)`.
- **Lessons completed** = `COUNT(LessonProgress WHERE studentId = ? AND isCompleted = true)`.
- **Enrolled courses** = `COUNT(Enrollment WHERE studentId = ? AND status = 'active')`.
- **Completion rate** = `round( completedEnrollments / totalEnrollments * 100 )`, where
  `completedEnrollments = COUNT(completedAt IS NOT NULL)` and `totalEnrollments = COUNT(*)`
  for the student; `0%` when `totalEnrollments = 0`.
- Deltas bucket the three count metrics by `enrolledAt` / `LessonProgress.completedAt` /
  `Enrollment.completedAt` into this-month vs last-month windows from `getMonthWindows()`.
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
  lessonsCompleted: { total: number; delta: StatDelta };
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
          enrollmentRepository.getStudentEnrollmentStats(studentId)   → enrolled + buckets
          enrollmentRepository.getStudentCompletionStats(studentId)   → certs/buckets + rate
          lessonProgressRepository.getStudentLessonStats(studentId)   → lessons + buckets
        ])
        └─ computeDelta(thisMonth, lastMonth) per count metric → StudentDashboardStats
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
- `lib/stats/statDelta.ts` — neutral home for the `StatDelta` type (moved from
  `server/entities/instructor/dashboard.ts`).
- `server/entities/student/dashboard.ts` — `StudentDashboardStats`, `ContinueLearningItem`.
- `server/services/student/student.service.ts` — `StudentService` with `getDashboardStats`
  and `getContinueLearning`; composes repositories, applies `computeDelta`, resolves next
  lesson, logs with the student id.
- `server/services/student/student.service.test.ts` — unit tests (mocked repositories) for
  delta wiring, completion-rate maths, zero-data, and next-lesson resolution.
- `server/api/routers/student.ts` — `studentRouter` with the two `studentProcedure` queries.
- `lib/requests/student/getDashboardStats.ts` — RSC wrapper; degrades to zeroed stats.
- `lib/requests/student/getContinueLearning.ts` — RSC wrapper; degrades to `[]`.
- `app/_components/Dashboard/StatsCards/index.tsx` + `types.ts` — student stat cards
  (Enrolled Courses, Lessons Completed, Certificates, Completion Rate), reusing the
  `DeltaBadge`/`StatCard` shape from the instructor cards.
- `app/_components/Dashboard/ContinueLearning/index.tsx` + `types.ts` — in-progress list
  with resume links and an empty state.

**Modified**
- `server/entities/instructor/dashboard.ts` — re-export `StatDelta` from
  `lib/stats/statDelta` (keeps existing importers working).
- `lib/stats/computeDelta.ts` — import `StatDelta` from its new sibling.
- `server/api/root.ts` — register `student` router.
- `server/repositories/enrollment.repository.ts` — add `getStudentEnrollmentStats`,
  `getStudentCompletionStats`, `findInProgressForContinue`.
- `server/repositories/lessonProgress.repository.ts` — add `getStudentLessonStats`
  (total + month buckets via `getMonthWindows`).
- `server/repositories/lesson.repository.ts` — add `findOrderedLessonIdsByCourseIds`
  (ordered by `Section.order`, `Lesson.order`, non-deleted).
- `app/dashboard/page.tsx` — fetch real data; render `<DashboardStatsCards>` and
  `<ContinueLearning>` in place of the hardcoded markup; keep `<RecommendedRail>`.

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
| Relocating `StatDelta` breaks an importer | L / M | Instructor module re-exports the type; `pnpm typecheck` in validation confirms no broken imports. |
| Completion-rate denominator includes inactive/old enrollments, skewing the figure | L / L | Decision #4/FR7 define it over all the student's enrollments; documented and consistent. |

## Rollout / migration

- No env vars, no database migration, no backfill.
- Pure additive code change; revert by restoring the previous `app/dashboard/page.tsx` and
  removing the new files. The relocated `StatDelta` is the only shared touch and is
  behaviour-preserving.