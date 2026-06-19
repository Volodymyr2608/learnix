# Requirements: Instructor Reviews Dashboard (Read-Only, Real Data)

> Design in [`spec.md`](./spec.md) · plan in [`plan.md`](./plan.md) · checks in [`validation.md`](./validation.md)

## Status: planned — instructor portal

Date: 2026-06-19 · Author: Volodymyr Pelykh · Stakeholder: Volodymyr Pelykh

## Problem

`/instructor/reviews` was scaffolded from a UI mock and ships entirely on fabricated, in-memory
data. `ReviewsOverview` (`app/_components/Instructor/Reviews/index.tsx:38-95`) hardcodes a static
`initialReviews` array (five fake students/courses) and computes every number — average, total,
distribution, "5-star %" — from it. Every instructor sees the same five reviews regardless of
what students actually wrote, and the data resets on refresh.

The mock also assumes a data shape the platform does not have:

- An instructor **reply** feature (`replied`, `reply`, "Pending replies" stat, reply box, the
  Replied / Needs-reply badges) — the `CourseReview` model has no reply concept
  (`prisma/schema/review.prisma:12-34`).
- A review **`title`** distinct from the body — reviews only have a single `comment`
  (`prisma/schema/review.prisma:22`).

Meanwhile the real data and most of the aggregation already exist and are unused by this page:
`courseReviewRepository.getInstructorRatingStats` returns `{ average, reviewCount }` scoped to the
instructor's non-deleted courses (`server/repositories/courseReview.repository.ts:16`), and
`reviewRouter` currently exposes only the **student**-facing `getEligibility` + `create`
(`server/api/routers/review.ts:7-29`) — there is no instructor-facing query to list or aggregate
reviews for this page.

Finally the route wrapper is mislabelled: `app/instructor/reviews/page.tsx:6-9` passes
`title="Revenue"` and a revenue description to `PageShell`, while the component renders its own
duplicate `<h1>Reviews</h1>` header (`app/_components/Instructor/Reviews/index.tsx:194`).

## Goal

- An instructor visiting `/instructor/reviews` sees the real reviews students left on the courses
  they own — actual student names, course titles, ratings, comments, tags, and dates — never the
  mock five.
- The summary stats (average rating, total reviews, rating distribution, 5-star share) are
  computed from those real reviews and agree with the figures shown elsewhere for the same
  instructor (e.g. the dashboard rating stat).
- The instructor can narrow the page to a single course and to a single rating, and the page
  reflects an empty result honestly (no fabricated fallback rows).
- A brand-new instructor with zero reviews sees a clear empty state, not a crash and not the mock
  data.
- The reply feature is removed from this page (deferred to its own spec), so nothing on the page
  promises an action the backend cannot fulfil.

## Scope decisions (locked)

1. **Read-only this iteration — no replies.** The reply box, "Pending replies" stat, and the
   Replied / Needs-reply badges are removed. Instructor replies (schema, mutation, student-facing
   display, notification) are a separate follow-up spec. — rules out any write/mutation on this
   page.
2. **No review `title`.** Each review renders its single `comment` as the body; the mock's
   separate bold title line is dropped. — keeps the page aligned with the `CourseReview` schema.
3. **Surface real review `tags` instead.** Where the mock showed a title, render the review's
   `tags` (`COURSE_CONTENT`, `INSTRUCTOR`, `PRACTICAL_EXAMPLES`, `PACE`, `RESOURCES`, `EXERCISES`)
   as badges when present. — replaces fake data with a real schema field already collected at
   review time.
4. **Course filter rescopes the whole page; rating filter scopes the list only.** Selecting a
   course recomputes the stats + distribution **and** filters the list to that course. The rating
   tabs filter only the review list (a distribution of "only 5-star" reviews is meaningless). —
   rules out the mock's behaviour where the course dropdown changed nothing about the stats.
5. **The course dropdown lists only the instructor's courses that have at least one review**, plus
   "All courses". — avoids offering filters that always return empty.
6. **The review list is paginated; the stats are global aggregates.** Average / total /
   distribution are computed across all of the (course-filtered) reviews on the server, not just
   the current page. — rules out computing stats from a single page of rows.
7. **Default sort is newest first.** No sort control this iteration. — keeps scope to the mock's
   single ordering.
8. **Fix the route wrapper.** `PageShell` is given the correct Reviews title/description and the
   component stops rendering its own duplicate `<h1>`. — removes the "Revenue" mislabel and the
   double header.

## Assumptions & constraints

- "Reviews for the instructor" means non-deleted `CourseReview` rows whose course is owned by the
  current instructor and not deleted — the same scoping already used by
  `getInstructorRatingStats` (`server/repositories/courseReview.repository.ts:21-23`).
- Access is restricted to the authenticated instructor; the instructor id comes from
  `ctx.session.user.id` via `instructorProcedure`, never from client input.
- Average rating uses the same definition as the instructor dashboard's rating stat, so the two
  never diverge for the same instructor (all-courses view).
- Student display name comes from `User.name`; avatar initials are derived from it client-side.
- Dates render in the existing absolute style used by the mock (e.g. "Dec 14, 2025"), in server
  locale.
- Must follow the three-layer pattern (router → service → repository) and the `CLAUDE.md`
  component conventions (colocated `types.ts`, no inline prop types, no nested ternaries,
  extracted sub-components, flattened loading states), and use the shared UI primitives in
  `app/_components/_shared/ui/` rather than the mock's `@/components/ui/*` imports.
- No schema migration is required for this feature (all fields read already exist).

## Functional requirements

### Stats row

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR1 | Average Rating card | Shows the mean `rating` (one decimal) over the instructor's reviews in the current course scope; with zero reviews shows "0.0" (or an em dash) and a star row of 0. |
| FR2 | Total Reviews card | Shows the count of the instructor's reviews in the current course scope. |
| FR3 | 5-Star share card | Shows the percentage of in-scope reviews with `rating === 5`, rounded to a whole number; with zero reviews shows "0%". |
| FR4 | Fourth card (attention) | Shows the count of low ratings (`rating <= 2`) in the current course scope, labelled so the instructor knows these are reviews worth reading; with zero shows "0". |

### Rating distribution

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR5 | Distribution bars | For stars 5→1, shows a bar whose fill is that star's share of in-scope reviews and a count; the five counts sum to Total Reviews (FR2). |
| FR6 | Summary block | Shows the average (FR1) as a large number with a rounded star row and "Based on N reviews" using the in-scope total. |

### Filters

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR7 | Course dropdown | Lists "All courses" plus every course the instructor owns that has ≥1 non-deleted review. Selecting one rescopes stats, distribution, and list to that course (decision #4). |
| FR8 | Rating tabs | "All / 5 / 4 / 3 / 2 / 1"; selecting a star filters the **review list** to that rating only. Stats and distribution are unaffected (decision #4). |
| FR9 | Combined filters | Course + rating filters compose: the list shows reviews matching both. |

### Review list

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR10 | Review card | Each card shows student name, initials avatar, course title, a 5-star row reflecting `rating`, the formatted `createdAt` date, and the `comment` body. |
| FR11 | Tag badges | When a review has `tags`, they render as badges on the card; with no tags, no badge row appears (decision #3). |
| FR12 | Ordering & pagination | Reviews are newest-first; the list is paginated (or load-more), and stats remain global to the scope, not the page (decisions #6, #7). |
| FR13 | Empty-filter state | When filters match no reviews, the list shows a "No reviews match your filters" message and the stats reflect the (possibly zero) in-scope aggregates — no mock rows. |
| FR14 | No-reviews state | An instructor with zero reviews on any course sees a clear empty state across stats and list, with no runtime error and no leftover mock data. |

### Route wrapper

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR15 | Page header | `/instructor/reviews` shows a single "Reviews" heading with a reviews-appropriate description; the "Revenue" title/description and the duplicate in-component `<h1>` are gone (decision #8). |

## Non-functional requirements

| Aspect | Requirement |
|--------|-------------|
| Security / authz | Served via `instructorProcedure`, scoped to `ctx.session.user.id`; no instructor/course id is trusted from the client without verifying instructor ownership; one instructor never sees another's reviews. |
| Performance | Stats/distribution computed via DB aggregates (not by loading all rows into JS); the list query is paginated; no N+1 over students/courses (student name + course title fetched via `select`/join). |
| Reliability | A transient fetch failure degrades to a sensible empty/zero state rather than crashing the page, consistent with existing instructor pages. |
| Accessibility / UX | Star ratings have a non-visual label (e.g. "4 out of 5"); filter controls are keyboard-operable; loading states are flattened per `CLAUDE.md`. |
| Observability | The instructor query logs the instructor id consistent with existing repository/service logging. |
| Data / privacy | No new data persisted; only existing `CourseReview` / `User` / `Course` fields are read. |

## Success metrics

- An instructor with real reviews sees their actual reviews, and the average/total/distribution
  match Prisma Studio and the dashboard rating stat for the all-courses view.
- Selecting a course rescopes the stats and list to that course; selecting a rating filters the
  list while leaving stats unchanged.
- A newly created instructor with no reviews sees the empty state with zeroed stats — no crash,
  no mock names (Sarah Johnson, Mike Chen, …) anywhere in the DOM.
- Two different instructors see different, correct reviews and figures matching their own data.

## Out of scope (deferred)

- **Instructor replies** to reviews (schema field, mutation, student-facing display, student
  notification) — own follow-up spec.
- Review `title` field — not in the schema; not added here.
- Sort controls, date-range filters, search within reviews, CSV export.
- Editing, hiding, reporting, or moderating reviews.
- Changing how/when students create reviews (`reviewRouter.create` is untouched).

## Open questions

- None.