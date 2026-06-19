# Spec: Dynamic "New Reviews" Sidebar Badge

> Requirements in [`requirements.md`](./requirements.md) · plan in [`plan.md`](./plan.md) · checks in [`validation.md`](./validation.md)

## Approach (overview)

Add one nullable column, `InstructorProfile.reviewsLastViewedAt`, and derive the badge as a `COUNT`
of the instructor's non-deleted reviews created after that timestamp. Two `instructorProcedure`s
back it: `getNewReviewsCount` (read) and `markReviewsViewed` (stamp `now()`). The badge count flows
into the sidebar the same way every other instructor figure does — `DashboardSidebar` is already an
RSC, so it fetches the count (only when `isInstructor`) via a request helper and passes it into the
`Navigation` client component, which replaces the hardcoded `badge: "5"`. The one non-obvious part
is clearing: the sidebar lives in the shared layout and does not re-render on in-layout navigation,
so a small client component `MarkReviewsViewed` on the Reviews page calls the `markReviewsViewed`
mutation on mount and then `router.refresh()`, which re-runs the server layout and recomputes the
badge to 0. Rejected alternative: stamping inside the Reviews RSC render (a write during a GET) —
it neither reliably revalidates the sibling layout nor is it idiomatic; the explicit
mutation + `router.refresh()` is the standard App Router "mark as read" pattern.

## Architectural decisions referenced

- **ADR-003 (Repository pattern)** — the count is a new `CourseReviewRepository` method; the
  timestamp read/write are new `InstructorRepository` methods; the service composes them. No raw SQL.
- **ADR-004 (Role-based tRPC procedures)** — both procedures are `instructorProcedure`; the
  instructor id is always `ctx.session.user.id`.
- **ADR-011 (Component folder architecture)** — `Navigation` keeps its colocated `types.ts`; the new
  `MarkReviewsViewed` gets its own folder; no nested ternaries; the badge value is derived, not
  inlined as a literal.

## Data model

### `prisma/schema/instructor.prisma` (modified)

```prisma
model InstructorProfile {
  // ...existing fields...
  reviewsLastViewedAt DateTime? @map("reviews_last_viewed_at")
  // ...
}
```

**Migration ordering (single migration):**
1. `ALTER TABLE instructor_profiles ADD COLUMN reviews_last_viewed_at TIMESTAMP(3);` (nullable).
2. Backfill so historical reviews don't count as new (decision #5 / FR9):
   `UPDATE instructor_profiles SET reviews_last_viewed_at = NOW() WHERE reviews_last_viewed_at IS NULL;`

The column stays nullable afterward (new profiles start null; FR10 handles null as "count all", which
is harmless because a new instructor has no reviews).

## API & contracts

| Procedure / route | Type / auth | Input → Output | Notes |
|-------------------|-------------|----------------|-------|
| `instructor.getNewReviewsCount` | `instructorProcedure` | `undefined` → `number` | Count of new reviews since `reviewsLastViewedAt`. Read-only. |
| `instructor.markReviewsViewed` | `instructorProcedure` (mutation) | `undefined` → `{ success: true }` | Stamps `reviewsLastViewedAt = now()`. Idempotent. |

## Component / data flow

```
Layout render (RSC: app/_components/Dashboard/Layout → DashboardSidebar)
  requireAuth → { isInstructor }
  if isInstructor:
     getNewReviewsCount()  [lib/requests/instructor/getNewReviewsCount.ts]
        → api.instructor.getNewReviewsCount()  [instructorProcedure]
            → instructorService.getNewReviewsCount(instructorId)
                 since = instructorRepository.getReviewsLastViewedAt(userId)
                 → courseReviewRepository.countNewByInstructor(instructorId, since)
                      COUNT WHERE deletedAt=null AND course.instructorId=me AND course.deletedAt=null
                                 AND (since ? createdAt > since : true)
  <Navigation isInstructor reviewsCount={count} />   // 0 when not instructor / on fetch error
     → Reviews item renders badge: count===0 ? none : count>9 ? "9+" : String(count)

Open /instructor/reviews (RSC page)
  ...renders ReviewsStats / ReviewsResults (existing)...
  <MarkReviewsViewed />   // "use client"
     useEffect on mount:
        markReviewsViewed.mutate()  → instructorService.markReviewsViewed(instructorId)
                                         → instructorRepository.touchReviewsViewed(userId) (set now())
        on success → router.refresh()   // re-runs server layout → getNewReviewsCount → 0 → badge gone

Failure paths:
  getNewReviewsCount throws → request helper returns 0 → no badge (FR/NFR Reliability).
  markReviewsViewed throws → logged in service; mutation onError swallows; page still renders.
```

## File list

No new entity/DTO is needed: `getNewReviewsCount` returns a `number` and `markReviewsViewed` returns
`{ success: true }`, both primitives.

**Modified — server**
- `prisma/schema/instructor.prisma` — add `reviewsLastViewedAt`.
- `server/repositories/courseReview.repository.ts` — add `countNewByInstructor(instructorId, since: Date | null): Promise<number>` (single `this.model.count`).
- `server/repositories/instructor.repository.ts` — add `getReviewsLastViewedAt(userId): Promise<Date | null>` and `touchReviewsViewed(userId): Promise<void>` (update by unique `userId`).
- `server/services/instructor/instructor.service.ts` — add `getNewReviewsCount(instructorId)` and `markReviewsViewed(instructorId)`.
- `server/api/routers/instructor.ts` — add `getNewReviewsCount` query and `markReviewsViewed` mutation.

**New — client**
- `lib/requests/instructor/getNewReviewsCount.ts` — `api.instructor.getNewReviewsCount()`, returns `0` on error.
- `app/_components/Instructor/Reviews/MarkReviewsViewed/index.tsx` — `"use client"`; on mount, `api.instructor.markReviewsViewed.useMutation()` then `router.refresh()`. (Renders nothing.)

**Modified — client**
- `lib/constants/urls/instructorUrls.ts` — add `reviews: \`${MAIN_URL}/reviews\`` (currently the path is hardcoded in `Navigation`).
- `app/_components/Dashboard/Sidebar/index.tsx` — when `isInstructor`, fetch the count and pass `reviewsCount` to `Navigation`.
- `app/_components/Dashboard/Sidebar/components/Navigation/index.tsx` — accept `reviewsCount`; remove `badge: "5"`; derive the Reviews badge from the count (hidden at 0, `9+` over 9) via a small `formatBadge` helper; use `INSTRUCTOR_URLS.reviews` for the href/match.
- `app/_components/Dashboard/Sidebar/components/Navigation/types.ts` — add `reviewsCount: number` to `NavigationProps`.
- `app/instructor/reviews/page.tsx` — render `<MarkReviewsViewed />` (the stamp-on-open trigger).

## Cross-cutting concerns

- **Security / authz:** both procedures are `instructorProcedure`; the count `where` pins
  `course.instructorId = ctx.session.user.id`; the timestamp read/write key on the session user's
  profile. No id from the client (NFR Security).
- **Error handling:** the request helper returns `0` on failure (no badge); `markReviewsViewed`
  failures are logged in the service and swallowed by the mutation's `onError`, so the Reviews page
  always renders (NFR Reliability, FR7).
- **Idempotency / consistency:** `markReviewsViewed` is a single idempotent `UPDATE ... SET now()`;
  re-running it only moves the timestamp forward.
- **Clearing mechanism:** `router.refresh()` after the mutation is the single trigger that
  re-renders the server layout; without it the badge would not clear until a hard reload (this is the
  key risk, mitigated below).
- **Observability:** `getNewReviewsCount` and `markReviewsViewed` log `{ instructorId }`.
- **Performance:** one indexed `COUNT` per layout render for instructors only; the existing
  `course_reviews` indexes on `courseId`/`deletedAt` cover the join, and `createdAt > since` is a
  range scan over an already-small per-instructor set.

## Risks & mitigations

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| Badge does not clear because the layout isn't re-rendered on navigation | M / M | `MarkReviewsViewed` calls `router.refresh()` after the mutation resolves; validation includes a manual check that the badge clears without a hard reload. |
| Brief flash of the old count on first paint of the Reviews page before the mutation resolves | M / L | Accepted (decision #4 territory); the stamp+refresh happen on mount so the badge clears within the visit. |
| Migration backfill missed → existing instructors see a large badge on rollout | L / M | Backfill `UPDATE` is part of the same migration (FR9); validation asserts an existing instructor shows no badge immediately after migrate. |
| Count query drifts from the dashboard's review scoping | L / L | Reuses the identical instructor-ownership `where` (`course.is.instructorId`, `deletedAt: null`) already used by `findInstructorReviews`. |

## Rollout / migration

One Prisma migration (`pnpm db:generate`) that adds the nullable column and runs the backfill
`UPDATE`. No env vars, no feature flag. Safe to revert: dropping the column and reverting the
component restores the static badge. The mark-viewed write is harmless if the column is later removed
(the procedures would be reverted together).