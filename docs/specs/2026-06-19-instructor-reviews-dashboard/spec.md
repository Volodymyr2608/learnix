# Spec: Instructor Reviews Dashboard (Read-Only, Real Data)

> Requirements in [`requirements.md`](./requirements.md) · plan in [`plan.md`](./plan.md) · checks in [`validation.md`](./validation.md)

## Approach (overview)

Mirror the existing **Students** feature end-to-end, since it already solves the exact shape of
this problem (URL-driven filters + paginated list + server-computed stats for one instructor).
Three new `instructorProcedure` queries back the page: `getReviewStats` (course-scoped aggregates +
distribution), `getReviews` (paginated, course+rating filtered list), and `getReviewCourseOptions`
(courses that actually have reviews, for the dropdown). All three are thin service methods over new
`CourseReviewRepository` methods that reuse the same instructor-ownership `where` clause already in
`getInstructorRatingStats`. The page is an RSC that parses search params and `Promise.all`s the
three request helpers; the mock's single 388-line `ReviewsOverview` client component is replaced by
focused sub-components following `CLAUDE.md` conventions. The key design choice (decision #4) — the
course filter rescopes stats while the rating filter scopes only the list — falls out naturally:
`getReviewStats` takes `courseId` only, `getReviews` takes `courseId` + `rating`. Rejected
alternative: a single combined endpoint returning stats+list, which would force recomputing global
distribution on every rating-tab click and couple two independently-cacheable concerns.

## Architectural decisions referenced

- **ADR-003 (Repository pattern)** — all new aggregation lives in `CourseReviewRepository` methods;
  services call repositories, the router calls the service. No raw SQL (Prisma `groupBy`/`findMany`
  suffice).
- **ADR-004 (Role-based tRPC procedures)** — all three queries are `instructorProcedure`; the
  instructor id is always `ctx.session.user.id`, never client input. Any `courseId` is filtered
  through the instructor-ownership `where`, so a foreign `courseId` simply yields empty results
  (no IDOR).
- **ADR-011 (Component folder architecture)** — every new component folder gets a colocated
  `types.ts`; repeated card/row layout is extracted into named sub-components; no nested ternaries;
  loading states are flattened.

## Data model

No schema changes. All fields read already exist on `CourseReview`
(`prisma/schema/review.prisma:12-34`: `rating`, `comment`, `tags`, `createdAt`, `courseId`,
`studentId`), `User.name`/`User.image`, and `Course.title`/`Course.instructorId`. The reply feature
(which would have required a migration) is explicitly out of scope (decision #1).

## API & contracts

| Procedure / route | Type / auth | Input → Output | Notes |
|-------------------|-------------|----------------|-------|
| `instructor.getReviewCourseOptions` | `instructorProcedure` | `undefined` → `ReviewCourseOption[]` | Courses the instructor owns with ≥1 non-deleted review (decision #5). |
| `instructor.getReviewStats` | `instructorProcedure` | `GetReviewStatsInput` → `ReviewStats` | Course-scoped (decision #4); rating/page do NOT apply. |
| `instructor.getReviews` | `instructorProcedure` | `GetReviewsInput` → `PaginatedReviews` | Course + rating filtered, newest-first, paginated (decisions #4, #6, #7). |

```ts
// server/entities/instructor/reviews.ts
import { z } from "zod";
import type { ReviewTag } from "@/generated/prisma";

export const REVIEWS_PER_PAGE = 10;

export const getReviewStatsInput = z.object({
  courseId: z.string().cuid().optional(),
});
export type GetReviewStatsInput = z.infer<typeof getReviewStatsInput>;

export const getReviewsInput = z.object({
  courseId: z.string().cuid().optional(),
  rating: z.number().int().min(1).max(5).optional(),
  page: z.number().int().min(1).default(1),
});
export type GetReviewsInput = z.infer<typeof getReviewsInput>;

export type ReviewCourseOption = { id: string; title: string };

export type RatingDistributionBucket = {
  star: number;   // 5..1
  count: number;
  percent: number; // 0..100, share of `total`
};

export type ReviewStats = {
  average: number | null;   // null when total === 0 (FR1)
  total: number;            // FR2
  fiveStarPercent: number;  // 0..100 (FR3)
  lowRatingCount: number;   // rating <= 2 (FR4)
  distribution: RatingDistributionBucket[]; // always 5 buckets, star 5..1 (FR5)
};

export type ReviewRow = {
  id: string;
  studentName: string;
  studentImage: string | null;
  courseTitle: string;
  rating: number;          // 1..5
  comment: string;
  tags: ReviewTag[];
  createdAt: Date;
};

export type PaginatedReviews = {
  data: ReviewRow[];
  total: number;
  currentPage: number;
  perPage: number;
  lastPage: number;
};

// Page-local controlled query state (string-based, mirrors Students)
export type ReviewsQueryState = {
  courseId: string; // "all" | cuid
  rating: string;   // "all" | "1".."5"
  page: number;
};
```

## Component / data flow

```
/instructor/reviews/page.tsx (RSC)
  parse searchParams -> ReviewsQueryState
  Promise.all:
    getReviewCourseOptions()                         -> ReviewCourseOption[]
    getReviewStats(toStatsInput(query))              -> ReviewStats        (courseId only)
    getReviews(toReviewsInput(query))                -> PaginatedReviews   (courseId + rating + page)
  -> <PageShell title="Reviews" description=...>
       <ReviewsStats stats={stats} />                         // 4 StatCards + summary/distribution
       <ReviewsFilters courses={options} query={query} />     // course Select (client)
       <ReviewsResults reviews={reviews} query={query} />     // rating Tabs + list + pagination (client)

Each request helper (lib/requests/instructor/*) wraps the tRPC call in try/catch and returns a
zeroed/empty fallback on error, so a transient failure renders empty stats + empty list, never a
crash (FR13/FR14, NFR Reliability).

Filter interactions (all via URL search params, the source of truth — useReviewsUrl):
  course Select change  -> update({ courseId })  // changing a filter resets page; RSC refetches
                                                  // BOTH stats (rescoped) and list (decision #4)
  rating Tab change     -> update({ rating })     // resets page; RSC refetches list; stats input
                                                  // ignores rating so distribution is unchanged
  page change           -> update({ page })       // refetches list only
```

```
service: getReviewStats(instructorId, { courseId })
  -> courseReviewRepository.getInstructorReviewStats(instructorId, courseId)
       single Prisma groupBy({ by:["rating"], where:{ deletedAt:null,
         course:{ is:{ instructorId, deletedAt:null }}, ...(courseId && { courseId }) },
         _count:{ _all:true } })
       -> reduce 5 buckets -> { average, total, fiveStarCount, lowRatingCount, perStar }
  -> shape into ReviewStats (compute fiveStarPercent, distribution[5..1] with percent)
```

## File list

**New — server**
- `server/entities/instructor/reviews.ts` — Zod inputs + DTO types above.
- `server/repositories/courseReview.repository.ts` *(modified, see below)*.
- `server/services/instructor/instructor.service.ts` *(modified, see below)*.
- `server/api/routers/instructor.ts` *(modified, see below)*.

**New — client request helpers**
- `lib/requests/instructor/getReviewCourseOptions.ts` — `api.instructor.getReviewCourseOptions()`, `[]` fallback.
- `lib/requests/instructor/getReviewStats.ts` — `api.instructor.getReviewStats(input)`, zeroed-`ReviewStats` fallback.
- `lib/requests/instructor/getReviews.ts` — `api.instructor.getReviews(input)`, `empty(page)` fallback (mirrors `getStudents.ts`).

**New — UI** (`app/_components/Instructor/Reviews/`)
- `types.ts` — `ReviewsQueryState` re-export + all sub-component prop types.
- `searchParams.ts` — `parseReviewsSearchParams`, `toStatsInput`, `toReviewsInput` (mirrors Students `searchParams.ts`).
- `hooks/useReviewsUrl.ts` — URL writer; filter change (`courseId`/`rating`) resets `page`; defaults (`all`/`1`) dropped (mirrors `useStudentsUrl.ts`).
- `Stars/index.tsx` — star row with `rating`/`size`, accessible label "N out of 5".
- `ReviewsStats/index.tsx` — 4 `StatCard`s (Average, Total, 5-Star %, Low ratings ≤2) + summary Card (big average + `Stars` + distribution bars via `Progress`). `StatCard` is a named sub-component.
- `ReviewsFilters/index.tsx` — `"use client"`; course `Select` → `update({ courseId })`.
- `ReviewsResults/index.tsx` — `"use client"`; rating `Tabs` → `update({ rating })`; maps `reviews.data` to `ReviewCard`; empty-filter message; pagination (Prev/Next + page indicator) → `update({ page })`.
- `ReviewCard/index.tsx` — avatar (initials from name), name, course title, `Stars`, formatted date (`date-fns` `format(d,"MMM d, yyyy")`), comment, tag `Badge`s.

**Modified**
- `app/instructor/reviews/page.tsx` — convert to async RSC; correct `PageShell` title `"Reviews"` / description `"See what students think of your courses."`; remove the `ReviewsOverview` import; compose the three sub-sections (FR15).
- `app/_components/Instructor/Reviews/index.tsx` — **deleted** (the mock `ReviewsOverview` + `initialReviews`); replaced by the folder above.
- `server/repositories/courseReview.repository.ts` — add `getInstructorReviewStats`, `findInstructorReviews`, `getInstructorReviewCourseOptions`.
- `server/services/instructor/instructor.service.ts` — add `getReviewStats`, `getReviews`, `getReviewCourseOptions`.
- `server/api/routers/instructor.ts` — add the three `instructorProcedure`s.

## Cross-cutting concerns

- **Security / authz:** all three queries are `instructorProcedure`; every repository `where`
  pins `course.is.instructorId = ctx.session.user.id` and `deletedAt: null`. A `courseId` the
  instructor doesn't own passes Zod (`cuid`) but matches nothing → empty result, so there is no
  IDOR and no error leak (NFR Security).
- **Error handling:** repository/service errors propagate to the router's existing
  `handleServiceError`; the request helpers' try/catch returns zeroed/empty fallbacks so the page
  degrades gracefully (FR13/FR14, NFR Reliability).
- **Idempotency / consistency:** read-only; no writes.
- **Observability:** each service method logs `{ instructorId, ...input }`, matching
  `getStudents`/`getDashboardStats` (`server/services/instructor/instructor.service.ts:91,199`).
- **Performance:** stats are a **single** `groupBy` (≤5 rows) — no rows loaded into JS; the list
  is one `findMany` (skip/take, `select`ed student name/image + course title — no N+1) plus one
  `count`; course options is one `findMany` with `distinct:["courseId"]`. The all-courses average
  equals `getInstructorRatingStats`, keeping FR (dashboard parity) true.

## Risks & mitigations

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| All-courses average diverges from the dashboard's rating stat | L / M | Both derive from the same `CourseReview` rows scoped by the identical instructor-ownership `where`; covered by an integration assertion comparing `getReviewStats(no courseId).average` to `getInstructorRatingStats().average`. |
| Average rounding makes distribution counts not sum to `total` | L / L | `total` and the 5 bucket counts come from the same `groupBy`; only `average`/`percent` are derived, never the counts (FR5 asserted in tests). |
| Replacing the mock breaks the route import | L / M | Page is updated in the same change that deletes `ReviewsOverview`; `pnpm typecheck` gate catches a dangling import before commit. |

## Rollout / migration

No env vars, no DB migration, no feature flag. Single PR. Reverting only touches the
`/instructor/reviews` path and the additive repository/service/router methods.