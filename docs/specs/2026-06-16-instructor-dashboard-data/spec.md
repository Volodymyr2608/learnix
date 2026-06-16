# Spec: Instructor Dashboard — Real Stat Cards

> Requirements in [`requirements.md`](./requirements.md) · plan in [`plan.md`](./plan.md) · checks in [`validation.md`](./validation.md)

## Approach (overview)

Add a single aggregating tRPC query, `instructor.getDashboardStats` (`instructorProcedure`),
that returns one typed `DashboardStats` DTO covering all four cards. The page
(`app/instructor/page.tsx`) stays a Server Component: it fetches the DTO once via the
existing `trpc/server` caller (wrapped in a `lib/requests/...` helper with a zeroed
fallback, mirroring `getCoursesStats`) and feeds it into extracted card sub-components.

Aggregation lives in `instructorService.getDashboardStats`, which fans out (concurrently)
to four repository methods — three new (revenue windows, student stats, rating stats) and
one reused (`courseRepository.getCoursesStats`) — then computes the month-over-month deltas
with pure, unit-testable helpers. Deltas are returned as a discriminated union so the UI
never does percentage math and the "New"/"hidden" edge cases (FR2, FR4) are explicit.

Key trade-off: **one orchestrating endpoint** vs. several granular ones. We chose one — the
dashboard always needs all four cards together, a single round-trip keeps the page a pure
Server Component, and the service is the natural place to compute deltas across data owned
by different repositories. The rejected alternative (reuse `payment.getInstructorEarnings`
+ `course.getCoursesStats` + new endpoints, called separately) spreads delta logic across
the page and multiplies round-trips. No new ADR is warranted — this follows existing
patterns only.

## Architectural decisions referenced

- **Three-layer pattern (router → service → repository)** — aggregation logic goes in
  `instructorService`; all DB access goes through repositories extending `BaseRepository`.
- **RSC `createCaller` fetch (`trpc/server`)** — the dashboard fetches server-side via the
  `lib/requests/instructor/getDashboardStats` helper, consistent with
  `lib/requests/course/getCoursesStats`.
- **Procedure-level role gating (`server/api/trpc.ts`)** — `instructorProcedure` enforces
  the instructor role; the instructor id comes from `ctx.session.user.id` (FR8).
- **Component conventions (`CLAUDE.md`)** — colocated `types.ts`, extracted sub-components
  for repeated card layout, no nested ternaries, flattened states.

## Data model

No schema changes. All data already exists:

- `Payment` (`prisma/schema/payments.prisma`) — `amountCents`, `status`, `refundedAt`,
  `instructorId`, `createdAt`.
- `Enrollment` (`prisma/schema/enrollment.prisma`) — `studentId`, `courseId`, `status`,
  `enrolledAt`; scoped to instructor via the `course.instructorId` relation.
- `CourseReview` (`prisma/schema/review.prisma`) — `rating`, `courseId`, `deletedAt`.
- `Course` — `instructorId`, `status`, `deletedAt` (for the courses card via
  `getCoursesStats`).

No migration, no backfill.

## API & contracts

| Procedure / route | Type / auth | Input → Output | Notes |
|-------------------|-------------|----------------|-------|
| `instructor.getDashboardStats` | `instructorProcedure` | `void` → `DashboardStats` | Read-only; instructor id from session; aggregates run via `Promise.all`. |

### DTO (`server/entities/instructor/dashboard.ts`)

```ts
export type StatDelta =
  | { kind: "percent"; value: number; direction: "up" | "down" | "flat" }
  | { kind: "new" }   // prior period 0, current > 0
  | { kind: "none" }; // nothing to compare (both periods 0)

export type DashboardStats = {
  revenue: { totalCents: number; delta: StatDelta };       // FR1, FR2
  students: { total: number; delta: StatDelta };           // FR3, FR4
  courses: { published: number; drafts: number };          // FR5
  rating: { average: number | null; reviewCount: number }; // FR6 (null = no reviews)
};
```

`average` is `null` when `reviewCount === 0` so the UI can render `—` / "No reviews yet"
without inventing a `0.0` rating.

## Component / data flow

```
app/instructor/page.tsx  (Server Component)
        │  await getDashboardStats()            ← lib/requests/instructor/getDashboardStats.ts
        ▼                                          (try/catch → zeroed DashboardStats fallback)
  api.instructor.getDashboardStats()  (trpc/server caller, instructorProcedure)
        │
        ▼
  instructorService.getDashboardStats(instructorId)
        │  Promise.all([
        │    paymentRepository.getInstructorRevenueStats(id)    → { lifetimeGross, thisMonth, lastMonth }
        │    enrollmentRepository.getInstructorStudentStats(id) → { total, thisMonthNew, lastMonthNew }
        │    courseReviewRepository.getInstructorRatingStats(id)→ { average|null, count }
        │    courseRepository.getCoursesStats(id)               → { published, draft }
        │  ])
        │  computeDelta(thisMonth, lastMonth)  ← lib/stats/computeDelta.ts (pure)
        │  getMonthWindows(now)                ← lib/stats/monthWindows.ts (pure)
        ▼
   DashboardStats  ──►  <DashboardStatsCards stats={...}/>
                              ├─ <StatCard> Total Revenue + <DeltaBadge>
                              ├─ <StatCard> Total Students + <DeltaBadge>
                              ├─ <StatCard> Active Courses (drafts sub-line)
                              └─ <StatCard> Avg. Rating (reviews sub-line / empty copy)
```

**Delta rule (`computeDelta(current, previous)`):**
- `previous > 0` → `{ kind: "percent", value: round((current-previous)/previous*100), direction }`
  where direction is `up` (>0), `down` (<0), `flat` (=0).
- `previous === 0 && current > 0` → `{ kind: "new" }`.
- `previous === 0 && current === 0` → `{ kind: "none" }`.

## File list

**New**
- `server/entities/instructor/dashboard.ts` — `DashboardStats`, `StatDelta` types.
- `lib/stats/monthWindows.ts` — `getMonthWindows(now)` → `{ startThisMonth, startLastMonth, startNextMonth }`; pure, testable.
- `lib/stats/computeDelta.ts` — `computeDelta(current, previous): StatDelta`; pure, testable.
- `server/services/instructor/instructor.service.ts` — *(modified, see below)* add `getDashboardStats`.
- `lib/requests/instructor/getDashboardStats.ts` — RSC fetch wrapper with zeroed fallback.
- `app/_components/Instructor/DashboardStatsCards/index.tsx` — renders the 4 cards from the DTO.
- `app/_components/Instructor/DashboardStatsCards/types.ts` — `DashboardStatsCardsProps`, `StatCardProps`, `DeltaBadgeProps`.

**Modified**
- `server/repositories/payment.repository.ts` — add `getInstructorRevenueStats(instructorId)` (lifetime gross + this/last-month gross via `aggregate` with `createdAt` windows; filter `status: "succeeded", refundedAt: null`).
- `server/repositories/enrollment.repository.ts` — add `getInstructorStudentStats(instructorId)` (distinct `studentId` across `course.instructorId` active enrollments + `count` of enrollments with `enrolledAt` in this/last month).
- `server/repositories/courseReview.repository.ts` — add `getInstructorRatingStats(instructorId)` (`aggregate` `_avg.rating` + `_count`, filtered to `course.instructorId`, `deletedAt: null`).
- `server/services/instructor/instructor.service.ts` — add `getDashboardStats(instructorId)` orchestrator.
- `server/api/routers/instructor.ts` — add `getDashboardStats` `instructorProcedure` query.
- `app/instructor/page.tsx` — replace the four hardcoded `<Card>` blocks with `<DashboardStatsCards>`; the other three sections (Top Performing Courses, Recent Activity, Revenue chart) are left untouched (out of scope, decision #2).

## Cross-cutting concerns

- **Security / authz:** `instructorProcedure`; instructor id from `ctx.session.user.id` only.
  Every aggregate filters by `instructorId` (payments/courses) or `course.instructorId`
  (enrollments/reviews) — no client-supplied id (FR8, no IDOR).
- **Error handling:** router wraps the service call in `handleServiceError`; the RSC helper
  `getDashboardStats` catches and returns a zeroed `DashboardStats` so a transient failure
  degrades to an empty dashboard rather than a crashed page (matches `getCoursesStats`).
- **Empty state:** `rating.average = null` and `delta.kind` of `"new"`/`"none"` drive the UI
  empty-state copy; the service returns these deterministically (FR2, FR4, FR6).
- **Observability:** `instructorService.getDashboardStats` logs at info with `{ instructorId }`,
  consistent with `getCoursesStats` logging.
- **Performance:** four aggregates run concurrently via `Promise.all`; all use indexed columns
  (`Payment@@index(instructorId)`, `Enrollment` course/student relations, `CourseReview@@index(courseId)`).
  Distinct-student count uses a `distinct`/`groupBy` query, not row hydration in the service.

## Risks & mitigations

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| Distinct-student count via `findMany({ distinct })` hydrates many rows at scale | L / M | Use Prisma `groupBy` on `studentId` (count groups) inside the repo method, not row loading. |
| Month-boundary / timezone off-by-one in delta windows | M / L | Centralize in `getMonthWindows` with unit tests covering month/year rollover; reuse the same windowing for revenue and enrollments. |
| Divide-by-zero / misleading % for new instructors | M / M | `computeDelta` returns `"new"`/`"none"`; unit-tested for all zero permutations. |

## Rollout / migration

No env vars, no migration, no feature flag. Ship behind the existing `feat/instructor-dashboard`
branch; the change is additive (new endpoint + repo methods) plus the page swap. Reverting is a
single revert of the page edit (endpoint/methods are unused if not called).