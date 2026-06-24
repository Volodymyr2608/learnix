# Spec: Real Data for OwnCoursesStats (Instructor Courses Page)

> Requirements in [`requirements.md`](./requirements.md) · plan in [`plan.md`](./plan.md) · checks in [`validation.md`](./validation.md)

## Approach (overview)

Add a `CourseService.getCoursesStats(instructorId)` method that runs the three existing,
already-tested repository aggregates concurrently — `courseRepository.getCoursesStats`,
`enrollmentRepository.getInstructorStudentStats`, `paymentRepository.getInstructorRevenueStats`
— and shapes them into one `CourseOwnerStats` DTO. The `course.getCoursesStats` tRPC procedure
calls this new service method instead of calling `courseRepository.getCoursesStats` directly
(closing a pre-existing gap where this one procedure skipped the service layer). The client
request helper and `OwnCoursesStats` component are updated to read the two new fields and render
them with `formatUsd` and absolute "this month" deltas, matching this page's existing subline
style (`+N this month`) rather than the dashboard's percentage `DeltaBadge`. No new persistence,
no new ADR — this is data wiring using infrastructure built for the instructor dashboard
(`docs/specs/2026-06-16-instructor-dashboard-data`), so the design rejects re-deriving student/
revenue totals from scratch in favor of reusing those exact repository methods (decision #1).

## Architectural decisions referenced

- **ADR-003 (Repository pattern)** — all new aggregation reuses existing repository methods
  (`courseRepository`, `enrollmentRepository`, `paymentRepository`); no new raw SQL is added.
- **ADR-004 (Role-based tRPC procedures)** — `getCoursesStats` stays an `instructorProcedure`;
  instructor id continues to come from `ctx.session.user.id`, never client input.
- **ADR-011 (Component folder architecture)** — `OwnCoursesStats` gains a colocated `types.ts`
  once it has a sub-component prop type, and the four repeated card blocks are extracted into a
  named `StatCard` sub-component (currently inlined 4×, which the convention caps at 2×).

## Data model

No schema changes. All figures are derived from existing `Enrollment` and `Payment` columns via
the repository methods cited in `requirements.md` (`enrollmentRepository.getInstructorStudentStats`,
`server/repositories/enrollment.repository.ts:282`; `paymentRepository.getInstructorRevenueStats`,
`server/repositories/payment.repository.ts:56`).

## API & contracts

| Procedure / route | Type / auth | Input → Output | Notes |
|-------------------|-------------|----------------|-------|
| `course.getCoursesStats` | `instructorProcedure` | `undefined` → `CourseOwnerStats` | Unchanged signature; output gains `students` and `revenue`. Now routed through `courseService` instead of calling the repository directly. |

```ts
// server/entities/course/stats.ts
export type CourseOwnerStats = {
  total: number;
  draft: number;
  published: number;
  lastCourses: number;       // courses created this calendar month (existing field, unchanged)
  students: {
    total: number;           // distinct students with an active enrollment (FR1)
    newThisMonth: number;    // FR2
  };
  revenue: {
    lifetimeGrossCents: number; // FR3
    thisMonthGrossCents: number; // FR4
  };
};
```

## Component / data flow

```
OwnCoursesStats (RSC)
  -> getCoursesStats() [lib/requests/course/getCoursesStats.ts]
       -> api.course.getCoursesStats() [tRPC, instructorProcedure]
            -> courseService.getCoursesStats(instructorId)
                 +-- courseRepository.getCoursesStats(instructorId)            \
                 +-- enrollmentRepository.getInstructorStudentStats(instructorId) >- Promise.all
                 +-- paymentRepository.getInstructorRevenueStats(instructorId) /
                 -> shape into CourseOwnerStats
  -> render 4 <StatCard> (Total Courses, Published, Total Students, Total Revenue)

Failure path: any repository call throws -> courseService lets it propagate -> router's existing
try/catch -> handleServiceError. The request helper's existing top-level try/catch still returns
the zeroed fallback object (now including zeroed students/revenue) so the page never crashes.
```

## File list

**New**
- `server/entities/course/stats.ts` — `CourseOwnerStats` type (mirrors `server/entities/instructor/dashboard.ts`'s style).
- `app/_components/Course/components/OwnCoursesStats/types.ts` — `StatCardProps` for the extracted sub-component.
- `server/services/course/course.service.test.ts` — unit tests for `CourseService.getCoursesStats`, mocking the three repositories (mirrors `server/services/instructor/instructor.service.test.ts`).

**Modified**
- `server/services/course/course.service.ts` — add `getCoursesStats(instructorId)`: `Promise.all` over the three repository calls, shaped into `CourseOwnerStats`.
- `server/api/routers/course.ts` — `getCoursesStats` procedure calls `courseService.getCoursesStats(ctx.session.user.id)` instead of `courseRepository.getCoursesStats(...)`.
- `lib/requests/course/getCoursesStats.ts` — extend the catch-block fallback with zeroed `students`/`revenue`.
- `app/_components/Course/components/OwnCoursesStats/index.tsx` — destructure `students`/`revenue`; extract `StatCard({ label, value, subline })`; render real Total Students (`students.total`, `+${students.newThisMonth} enrollments this month`) and Total Revenue (`formatUsd(revenue.lifetimeGrossCents)`, `+${formatUsd(revenue.thisMonthGrossCents)} this month`).

## Cross-cutting concerns

- **Security / authz:** unchanged — `instructorProcedure` already scopes every underlying repository call to `ctx.session.user.id`; no instructor id is ever read from client input (NFR: Security/authz).
- **Error handling:** no new error types; repository failures propagate to the router's existing `handleServiceError`, and the request helper's existing fallback absorbs them at the page level (FR5).
- **Idempotency / consistency:** read-only aggregation; no writes, no dedupe concerns.
- **Observability:** `CourseService.getCoursesStats` logs `{ instructorId }` on entry, consistent with `InstructorService.getDashboardStats` (`server/services/instructor/instructor.service.ts:91`).
- **Performance:** the three repository calls run concurrently via `Promise.all`, so total latency is the slowest of the three, not their sum; none of the three introduce N+1 queries (each is already a single aggregate query/transaction).

## Risks & mitigations

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| Courses-page figures silently drift from the dashboard's if someone later changes one call site but not the other | L / M | Both surfaces call the exact same repository methods (`enrollmentRepository.getInstructorStudentStats`, `paymentRepository.getInstructorRevenueStats`); no duplicated logic to drift. Covered by FR6 in validation. |
| Extracting `StatCard` changes existing "Total Courses"/"Published" card markup unintentionally | L / L | Sub-component takes the same `label`/`value`/`subline` shape already implied by the existing JSX; no visual/className changes, only DRY-ing the wrapper. |

## Rollout / migration

No env vars, no migration, no flag. Ships as a single PR; safe to revert independently since it only touches the courses-page stats path.