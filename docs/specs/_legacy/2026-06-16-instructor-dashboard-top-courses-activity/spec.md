# Spec: Instructor Dashboard — Top Performing Courses & Recent Activity

> Requirements in [`requirements.md`](./requirements.md) · plan in [`plan.md`](./plan.md) · checks in [`validation.md`](./validation.md)

## Approach (overview)

Add **two** read-only tRPC queries on the existing `instructor` router —
`instructor.getTopPerformingCourses` and `instructor.getRecentActivity` (both
`instructorProcedure`) — each returning a typed DTO. The page
(`app/instructor/page.tsx`) stays a Server Component: it fetches both DTOs through
`lib/requests/instructor/*` helpers (each with its own empty-array fallback, mirroring
`getDashboardStats`/`getRevenueTimeSeries`) inside a single `Promise.all`, then feeds
them into two new extracted island components that replace the hardcoded `<Card>` blocks
at `app/instructor/page.tsx:34-147`.

Aggregation lives in two new `instructorService` methods that fan out to repositories.
Top Performing reuses the **existing** `paymentRepository.getRevenueGroupedByCourse`
(ranked course IDs by gross revenue), then batch-hydrates titles + student counts
(active + completed enrollments, course repo) and average ratings (review repo) — no N+1. Recent Activity fetches the
N most-recent enrollments and N most-recent reviews (with `student`/`course` relations),
merges them into a discriminated-union event list sorted by timestamp, and slices to the
limit in the service.

**Key trade-off — two endpoints, not one.** The shipped stat-cards feature used a single
orchestrating endpoint because all four cards share one failure domain. Here the
reliability NFR explicitly wants **per-widget degradation** (a failing Top Performing
query must not blank Recent Activity). Two procedures + two RSC helpers each with their
own try/catch give that isolation while still being awaited concurrently. The rejected
alternative (one combined endpoint) couples the two widgets' failure modes. No new ADR is
warranted — this follows existing patterns only.

## Architectural decisions referenced

- **Three-layer pattern (router → service → repository)** — orchestration in
  `instructorService`; all DB access through repositories extending `BaseRepository`.
- **RSC `createCaller` fetch (`trpc/server`)** — the dashboard fetches server-side via
  `lib/requests/instructor/*` helpers, consistent with `getDashboardStats`.
- **Procedure-level role gating (`server/api/trpc.ts`)** — `instructorProcedure` enforces
  the instructor role; instructor id comes from `ctx.session.user.id`, never client input
  (FR3, FR11).
- **Component conventions (`CLAUDE.md`)** — colocated `types.ts`, sub-components extracted
  for repeated row layout, no nested ternaries, flattened loading/empty states.

## Data model

No schema changes, no migration, no backfill. All data already exists:

- `Payment` (`prisma/schema/payments.prisma`) — `amountCents`, `status`, `refundedAt`,
  `instructorId`, `courseId`, `createdAt`. Source for revenue ranking.
- `Course` — `id`, `title`, `instructorId`, `status`, `deletedAt`; relation `_count.enrollments`.
- `Enrollment` (`prisma/schema/enrollment.prisma`) — `studentId`, `courseId`, `status`,
  `enrolledAt`; `@@unique([studentId, courseId])` means **one row per student per
  course**, so an active-or-completed enrollment count per course equals the
  distinct-student count (FR4) — a student who finishes a course keeps counting, only
  `cancelled` is excluded. Relations: `student.name`, `course.title`.
- `CourseReview` (`prisma/schema/review.prisma`) — `rating` (1..5), `courseId`,
  `studentId`, `createdAt`, `deletedAt`; `@@index([courseId])`. Relations: `student.name`,
  `course.title`.

## API & contracts

| Procedure / route | Type / auth | Input → Output | Notes |
|-------------------|-------------|----------------|-------|
| `instructor.getTopPerformingCourses` | `instructorProcedure` | `void` → `TopCourse[]` | Read-only; instructor id from session; ≤3 rows; ranked by lifetime gross revenue. |
| `instructor.getRecentActivity` | `instructorProcedure` | `void` → `ActivityEvent[]` | Read-only; instructor id from session; ≤5 merged events, newest first. |

### DTOs (`server/entities/instructor/dashboard.ts`, appended to the existing file)

```ts
/** One row of the "Top Performing Courses" card (FR1, FR2). */
export type TopCourse = {
  courseId: string;
  title: string;
  students: number;          // active + completed enrollments = distinct students (FR4)
  rating: number | null;     // avg review rating; null = no reviews yet → "—" (FR5)
  grossCents: number;        // lifetime gross revenue, ranking key (FR2)
};

/** One entry in the "Recent Activity" feed (FR7–FR10). Discriminated by `type`. */
export type ActivityEvent =
  | {
      type: "enrollment";
      id: string;            // enrollment id (stable React key, FR8)
      studentName: string;
      courseTitle: string;
      occurredAt: Date;       // Enrollment.enrolledAt (superjson preserves Date)
    }
  | {
      type: "review";
      id: string;            // review id
      studentName: string;
      courseTitle: string;
      rating: number;        // 1..5
      occurredAt: Date;       // CourseReview.createdAt
    };
```

`rating` is `null` on `TopCourse` (not `0`) when the course has no reviews so the UI
renders `—` instead of a misleading `0.0`. `occurredAt` is a `Date` — superjson (the tRPC
transformer, `server/api/trpc.ts:48`) serializes it losslessly, and the UI formats it with
`date-fns`.

## Component / data flow

```
app/instructor/page.tsx  (Server Component)
   │  const [stats, revenueSeries, topCourses, activity] = await Promise.all([
   │     getDashboardStats(), getRevenueTimeSeries(),
   │     getTopPerformingCourses(),   ← lib/requests/instructor/getTopPerformingCourses.ts
   │     getRecentActivity(),         ← lib/requests/instructor/getRecentActivity.ts
   │  ])                                 (each try/catch → [] fallback, independent)
   ▼
 api.instructor.getTopPerformingCourses()        api.instructor.getRecentActivity()
   │  (trpc/server caller, instructorProcedure)     │
   ▼                                                 ▼
 instructorService.getTopPerformingCourses(id)    instructorService.getRecentActivity(id, 5)
   │  1. paymentRepository.getRevenueGroupedByCourse(id, EPOCH, 3)  │  Promise.all([
   │       → [{ courseId, grossCents }]  (revenue desc)             │   enrollmentRepository.findRecentByInstructor(id, 5)
   │  2. courseRepository.getCourseCardsByIds(id, ids)              │     → [{ id, studentName, courseTitle, enrolledAt }]
   │       → Map<courseId,{ title, students }>                      │   courseReviewRepository.findRecentByInstructor(id, 5)
   │  3. courseReviewRepository.getAvgRatingByCourseIds(ids)        │     → [{ id, studentName, courseTitle, rating, createdAt }]
   │       → Map<courseId, number|null>                            │  ])
   │  assemble + re-sort (grossCents↓, students↓, title↑), slice 3 │  map → ActivityEvent[],
   ▼                                                                 │  sort occurredAt↓, slice 5
 TopCourse[]  ──► <TopPerformingCourses courses={...}/>             ▼
                     ├─ empty? → empty-state copy (FR5)           ActivityEvent[] ──► <RecentActivity events={...}/>
                     └─ <TopCourseRow> × ≤3                            ├─ empty? → empty-state copy (FR12)
                                                                       └─ <ActivityRow> × ≤5 (icon by type, relative time)
```

**Ranking & tie-break (FR1, FR4):** `getRevenueGroupedByCourse` orders by
`_sum.amountCents desc` at the DB. Because Prisma `groupBy` tie order is not guaranteed,
the service re-sorts the assembled rows with a total comparator — `grossCents` desc, then
`students` desc, then `title` asc — before slicing to 3, so order is deterministic.
Courses with zero revenue never appear (they have no `Payment` rows), satisfying "no
courses with revenue → empty" (FR5).

**Merge & limit (FR7):** each side fetches its 5 newest rows; the merged set of ≤10 is
sorted by `occurredAt` desc and sliced to 5, so the result is the true 5 most-recent
across both types regardless of distribution.

## File list

**New**
- `server/entities/instructor/dashboard.ts` — *(modified)* append `TopCourse`,
  `ActivityEvent` types.
- `lib/utils/date/relativeTime.ts` — `relativeTimeLabel(date)` →
  `formatDistanceToNow(date, { addSuffix: true })`; pure, reused by the activity rows
  (mirrors the existing `updatedLabel.ts` pattern).
- `lib/requests/instructor/getTopPerformingCourses.ts` — RSC fetch wrapper, `[]` fallback.
- `lib/requests/instructor/getRecentActivity.ts` — RSC fetch wrapper, `[]` fallback.
- `app/_components/Instructor/TopPerformingCourses/index.tsx` — card; renders ≤3
  `<TopCourseRow>` or empty state.
- `app/_components/Instructor/TopPerformingCourses/types.ts` — `TopPerformingCoursesProps`,
  `TopCourseRowProps`.
- `app/_components/Instructor/RecentActivity/index.tsx` — card; renders ≤5 `<ActivityRow>`
  or empty state; icon chosen by `event.type` (no nested ternary — early-return helper).
- `app/_components/Instructor/RecentActivity/types.ts` — `RecentActivityProps`,
  `ActivityRowProps`.

**Modified**
- `server/repositories/course.repository.ts` — add
  `getCourseCardsByIds(instructorId, courseIds)`: `findMany` where
  `id in courseIds, instructorId, deletedAt: null`, selecting `id`, `title`, and
  `_count: { select: { enrollments: { where: { status: { in: [active, completed] } } } } }`;
  returns a map of `{ title, students }` keyed by course id. A `cancelled` enrollment
  never counts; a `completed` one still does.
- `server/repositories/courseReview.repository.ts` — add
  `getAvgRatingByCourseIds(courseIds)`: `groupBy` `courseId`, `_avg.rating`, where
  `courseId in ids, deletedAt: null`; returns `Map<courseId, number | null>`.
- `server/repositories/enrollment.repository.ts` — add
  `findRecentByInstructor(instructorId, take)`: `findMany` where
  `course.is { instructorId, deletedAt: null }, status: active`, `orderBy enrolledAt desc`,
  `take`, include `student.select.name` + `course.select.title`.
- `server/repositories/courseReview.repository.ts` — add
  `findRecentByInstructor(instructorId, take)`: `findMany` where
  `course.is { instructorId, deletedAt: null }, deletedAt: null`, `orderBy createdAt desc`,
  `take`, include `student.select.name` + `course.select.title`.
- `server/services/instructor/instructor.service.ts` — add `getTopPerformingCourses(id)`
  and `getRecentActivity(id, limit = 5)` orchestrators (assemble, re-sort, slice; map to
  DTOs).
- `server/api/routers/instructor.ts` — add the two `instructorProcedure` queries, each
  wrapped in `handleServiceError`.
- `app/instructor/page.tsx` — replace the two hardcoded `<Card>` blocks
  (`:34-147`, the Top Performing + Recent Activity columns) with `<TopPerformingCourses>`
  and `<RecentActivity>`; extend the existing fetch to a single `Promise.all`. The stat
  cards and revenue chart are untouched.

## Cross-cutting concerns

- **Security / authz:** both queries are `instructorProcedure`; instructor id is taken
  from `ctx.session.user.id`. Every repository method filters by `instructorId`
  (payments/courses) or `course.is.instructorId` (enrollments/reviews) — no client-supplied
  id, no IDOR (FR3, FR11).
- **Error handling:** routers wrap service calls in `handleServiceError`; each RSC helper
  catches and returns `[]`, so a failure in one widget degrades only that card to its
  empty state and never blanks the page or the sibling widget (reliability NFR).
- **Empty state:** the service returns `[]` for instructors with no qualifying data; the
  components render empty-state copy on a `length === 0` guard (FR5, FR12).
- **Observability:** both service methods log at info with `{ instructorId }`, consistent
  with `getDashboardStats`.
- **Performance:** Top Performing is exactly 3 bounded queries (revenue groupBy → batched
  title/count fetch → batched rating groupBy), no per-row follow-ups. Recent Activity is 2
  queries run via `Promise.all`, each `take`-limited with relations selected inline (no
  N+1). All filters hit indexed columns (`Payment@@index(instructorId)`,
  `Enrollment@@index(courseId)`, `CourseReview@@index(courseId)`).

## Risks & mitigations

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| Prisma `groupBy` tie order non-deterministic on equal revenue | M / L | Service re-sorts with a total comparator (revenue↓, students↓, title↑) before slicing (FR4). |
| `getRevenueGroupedByCourse` returns IDs of soft-deleted/unpublished courses (e.g. a course deleted after a sale) | L / M | `getCourseCardsByIds` filters `deletedAt: null` (+ instructor ownership); courses dropped there are filtered out of the final list, so a deleted course never renders. |
| A review/enrollment whose course was soft-deleted appears in the activity feed | L / L | Both `findRecentByInstructor` queries filter on `course.is { deletedAt: null }`. |
| `occurredAt` Date serialization across tRPC | L / L | superjson transformer (already configured) preserves `Date`; UI formats via `date-fns`. |

## Rollout / migration

No env vars, no migration, no feature flag. Additive (two endpoints + repo methods + two
components) plus the page swap on the existing `feat/dashboard-courses` branch. Reverting
is a single revert of the `app/instructor/page.tsx` edit — the new endpoints/methods are
dead code if uncalled.