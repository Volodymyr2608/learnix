# Spec: Instructor Course Card — Real Students/Rating/Revenue

> Requirements in [`requirements.md`](./requirements.md) · plan in [`plan.md`](./plan.md) · checks in [`validation.md`](./validation.md)

## Approach (overview)

Extend the existing `searchOwnCourses` pipeline instead of adding a new endpoint.
`courseRepository.searchOwnCourses` already paginates an instructor's courses; it gains
an enrollment `_count` (active + completed) in its `select`, so the student count comes
back for free in the same query that already runs. `courseService.searchOwnCourses`
then batch-hydrates the page's average rating (reusing the existing
`courseReviewRepository.getAvgRatingByCourseIds`) and a new
`paymentRepository.getRevenueByCourseIds`, merging both into the rows it returns. This
is the same assemble-by-batched-map pattern `instructorService.getTopPerformingCourses`
already uses for the dashboard card — no new architectural shape, just applied to a
different list.

`CourseCard` then renders the three real numbers instead of `"-"`, formatting rating
and revenue exactly like `TopCourseRow` already does (`rating.toFixed(1)` / `"—"`,
`formatUsd(revenueCents)`).

**Key trade-off — extend the existing query vs. a second endpoint.** A separate
`getCourseCardStats(courseIds)` query was considered, but `OwnCoursesList` already
fetches exactly the courses being rendered in one `searchOwnCourses` call; splitting
the stats into a second round-trip would add a second tRPC call and a join-in-the-UI
step for no isolation benefit (unlike Top Performing Courses, which deliberately needed
two *independent* widgets/failure domains — not the case here, this is one list). The
rejected alternative also can't reuse the pagination math (`page`, `total`,
`lastPage`) without duplicating it.

## Architectural decisions referenced

- **Three-layer pattern (router → service → repository)** — the enrollment count is a
  repository-level `select` concern; rating/revenue batching and merging is
  service-level orchestration, mirroring `instructorService.getTopPerformingCourses`.
- **Procedure-level role gating (`server/api/trpc.ts`)** — unchanged; `course.searchOwnCourses`
  is already `instructorProcedure`, instructor id from `ctx.session.user.id` (FR5).
- **Component conventions (`CLAUDE.md`)** — `CourseCard`'s prop type stays in its
  existing colocated `types.ts`; the rating ternary stays a single binary branch
  (allowed), consistent with the existing `TopCourseRow` pattern.

## Data model

No schema changes, no migration. All data already exists:

- `Enrollment` — `status` (`active` | `completed` | `cancelled`), `courseId`. Counted via
  Prisma relation `_count` directly on `Course.enrollments` (FR1).
- `CourseReview` — `rating`, `courseId`, `deletedAt`. Aggregated via the existing
  `courseReviewRepository.getAvgRatingByCourseIds` (FR2).
- `Payment` — `amountCents`, `status`, `refundedAt`, `courseId`. Aggregated via a new
  `paymentRepository.getRevenueByCourseIds` (FR3), same filter shape as the existing
  `getRevenueGroupedByCourse` but keyed by a specific id list instead of "top N by
  revenue."

### `OwnCourseRow` (`server/entities/course/ownCourses.ts`) — extended

```ts
export type OwnCourseRow = {
  id: string;
  title: string;
  status: CourseStatus;
  updatedAt: Date;
  thumbnailUrl: string | null;
  students: number;        // active + completed enrollments (FR1)
  rating: number | null;   // avg review rating; null = no reviews yet → "—" (FR2)
  revenueCents: number;    // lifetime gross revenue; 0 if no payments yet (FR3)
};
```

`PaginatedOwnCourses` is unchanged (`{ data: OwnCourseRow[], total, currentPage,
lastPage, perPage }`) — only the row shape grows.

## API & contracts

No new procedure. `instructor.course.searchOwnCourses` (existing, `instructorProcedure`)
keeps its current input (`GetOwnCoursesInput`) and now returns the extended
`OwnCourseRow` shape above as part of its existing `PaginatedOwnCourses` output.

## Component / data flow

```
app/instructor/courses/page.tsx → OwnCoursesList → searchOwnCourses(input)
                                                         │
                                                         ▼
                                  api.course.searchOwnCourses(input)
                                  (trpc, instructorProcedure)
                                                         │
                                                         ▼
                              courseService.searchOwnCourses(instructorId, input)
                                  │ 1. courseRepository.searchOwnCourses({ ...input, instructorId })
                                  │      → { data: [{ id, title, status, updatedAt,
                                  │           thumbnailUrl, students }], total, ... }
                                  │      (students = _count.enrollments, active+completed)
                                  │
                                  │ 2. if data.length === 0 → return as-is (no extra queries)
                                  │
                                  │ 3. const ids = data.map(c => c.id)
                                  │    Promise.all([
                                  │      courseReviewRepository.getAvgRatingByCourseIds(ids),
                                  │      paymentRepository.getRevenueByCourseIds(ids),
                                  │    ]) → [Map<id, number|null>, Map<id, number>]
                                  │
                                  │ 4. merge: data.map(c => ({ ...c,
                                  │      rating: ratings.get(c.id) ?? null,
                                  │      revenueCents: revenue.get(c.id) ?? 0 }))
                                  ▼
                              PaginatedOwnCourses (OwnCourseRow[] with real stats)
                                                         │
                                                         ▼
                              <CourseCard course={row} />  (×N, one per row)
                                  └─ Students: {course.students}
                                  └─ Rating: course.rating === null ? "—" : course.rating.toFixed(1)
                                  └─ Revenue: formatUsd(course.revenueCents)
```

**Why `students` is selected in step 1, not batched in step 3:** it's a relation count
on `Course` itself (`_count.enrollments`), so it comes back in the same `findMany` that
already fetches the page — no extra query, unlike rating/revenue which live on
unrelated tables and need their own aggregate query.

**Empty-page short-circuit:** when `data.length === 0` (e.g. a filter matches nothing),
the service skips the rating/revenue `Promise.all` entirely — mirrors
`getTopPerformingCourses`'s early return when `getRevenueGroupedByCourse` returns no
rows. Both `getAvgRatingByCourseIds` and the new `getRevenueByCourseIds` also tolerate an
empty id array defensively (return an empty `Map` immediately), so this is a perf
optimization, not a correctness requirement.

## File list

**Modified**
- `server/entities/course/ownCourses.ts` — extend `OwnCourseRow` with `students`,
  `rating`, `revenueCents`.
- `server/repositories/course.repository.ts` — `searchOwnCourses`'s `select` gains
  `_count: { select: { enrollments: { where: { status: { in: [active, completed] } } } } }`;
  map each row's `students: c._count.enrollments`.
- `server/repositories/payment.repository.ts` — add
  `getRevenueByCourseIds(courseIds: string[]): Promise<Map<string, number>>`: `groupBy`
  `courseId`, `_sum.amountCents`, where `courseId in ids, status: succeeded,
  refundedAt: null`; empty input → empty `Map` immediately (no query).
- `server/services/course/course.service.ts` — `searchOwnCourses` becomes: fetch the
  repo page, short-circuit if empty, else batch-fetch rating + revenue for the page's
  ids and merge into the returned rows.
- `app/_components/Course/components/CourseCard/index.tsx` — render
  `course.students`, `course.rating === null ? "—" : course.rating.toFixed(1)`, and
  `formatUsd(course.revenueCents)` in place of the three `"-"` placeholders; import
  `formatUsd` from `@/lib/formatUsd`.

No new files. No router change (existing procedure's output shape grows, input is
unchanged).

## Cross-cutting concerns

- **Security / authz:** unchanged surface — `course.searchOwnCourses` is already
  `instructorProcedure`, scoped by `ctx.session.user.id`. The new rating/revenue
  lookups only ever run against ids already filtered by `instructorId` in step 1, so
  they can't leak another instructor's data even though the helper methods themselves
  don't re-check ownership (same trust boundary `getTopPerformingCourses` already
  relies on for `getAvgRatingByCourseIds`) (FR5).
- **Error handling:** unchanged — `courseService.searchOwnCourses` propagates to the
  router's existing `handleServiceError`; no new failure mode introduced (two extra
  `groupBy` queries, same risk profile as the existing `count()` call already in the
  repo method).
- **Performance:** exactly 2 extra bounded queries per page load (rating groupBy +
  revenue groupBy), each `take`-equivalent via `courseId in [≤ COURSE_PAGE_SIZE ids]`,
  run concurrently via `Promise.all`, skipped entirely on an empty page (FR6).
- **Reliability:** a course missing from the rating map resolves to `null` → `—`; a
  course missing from the revenue map resolves to `0` → `$0` — both defaults are
  applied at the merge step, never left `undefined` (FR4).

## Risks & mitigations

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| Adding `_count` to `searchOwnCourses`'s `select` changes its returned shape in a way some other caller doesn't expect | L / L | `searchOwnCourses` has exactly one caller (`courseService.searchOwnCourses` → `course.searchOwnCourses` → `OwnCoursesList`); confirmed via repo-wide search before implementation. |
| `getRevenueByCourseIds` double-counts a refunded-then-repaid course, or a payment created after this page's snapshot is read | L / L | Same filter (`status: succeeded, refundedAt: null`) as every other lifetime-revenue read in the app (dashboard, Top Performing Courses) — not a new risk, just a new call site. |
| Two extra queries per page load regress list-page latency | L / L | Both are single indexed `groupBy`s over ≤`COURSE_PAGE_SIZE` ids, run concurrently with no dependency on each other; skipped outright when the page is empty. |

## Rollout / migration

No env vars, no migration, no feature flag. Purely additive query select + one new
repository method + a service merge step + a presentational change in `CourseCard`.
Revert is a single revert of the `course.service.ts` / `course.repository.ts` /
`CourseCard` changes — `OwnCourseRow`'s new fields are additive and ignored by any
caller that doesn't read them.