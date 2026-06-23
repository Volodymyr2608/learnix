# Requirements: Instructor Course Card — Real Students/Rating/Revenue

> Design in [`spec.md`](./spec.md) · plan in [`plan.md`](./plan.md) · checks in [`validation.md`](./validation.md)

## Status: planned

Date: 2026-06-19 · Author: Volodymyr Pelykh · Stakeholder: Volodymyr Pelykh

## Problem

On `/instructor/courses`, each course tile (`CourseCard`,
`app/_components/Course/components/CourseCard/index.tsx:46-57`) renders three stat
placeholders — Students, Rating, Revenue — as a literal `"-"`, regardless of the
course's actual data. The page (`OwnCoursesList`) already fetches real, paginated,
sortable course rows via `courseService.searchOwnCourses` →
`courseRepository.searchOwnCourses`, including a `sort: "students"` option, but the
underlying `OwnCourseRow` type
(`server/entities/course/ownCourses.ts:16-21`) only carries `id`, `title`, `status`,
`updatedAt`, `thumbnailUrl` — no student count, rating, or revenue is ever selected or
returned. The instructor-level "Total Students" / "Total Revenue" summary cards were
already wired to real data in `2026-06-18-instructor-courses-stats`, but that spec
explicitly deferred "any … per-course breakdown on this page" — this feature picks that
up for the per-card numbers.

## Goal

- Each course card on `/instructor/courses` shows that course's real student count,
  real average rating, and real lifetime revenue — never a placeholder.
- The numbers are consistent with the definitions already used elsewhere in the app
  (dashboard Top Performing Courses, instructor stat cards), so the same course shows
  the same student count/rating in both places.
- Draft courses render the same three-stat row, correctly showing zero/`—` rather than
  being hidden or crashing.
- No new N+1 queries: stats for an entire page of courses are fetched in a small,
  bounded number of queries regardless of page size.

## Scope decisions (locked)

1. **"Students" = active + completed enrollments.** Matches the definition just fixed
   for the dashboard's Top Performing Courses card (a student who finishes the course
   still counts; only a `cancelled` enrollment is excluded).
2. **"Rating" reuses the existing average-rating definition** — mean of that course's
   non-deleted reviews, `null`/`—` when there are no reviews yet. Same method already
   used by Top Performing Courses (`courseReviewRepository.getAvgRatingByCourseIds`).
3. **"Revenue" = lifetime gross revenue** — `SUM(amountCents)` over that course's
   succeeded, non-refunded payments. Same definition used by the dashboard revenue card
   and Top Performing Courses, just scoped to one course instead of "this instructor."
4. **Drafts show zeroed/`—` stats, not a hidden row.** A draft has no payments or
   enrollments yet, so its row legitimately reads `0 students`, `— rating`, `$0
   revenue` — no special-casing in the UI.
5. **Stats are computed for exactly the page of courses being rendered** (current
   `searchOwnCourses` pagination), not the instructor's entire catalog — keeps the
   query cost independent of how many courses an instructor owns.

## Assumptions & constraints

- Single currency (USD); revenue is stored in cents on `Payment.amountCents`.
- `CourseCard` is rendered only from `OwnCoursesList`, itself only reachable from
  `/instructor/courses` (instructor-only, ownership-scoped) — no other surface renders
  this component today.
- The existing `sort: "students"` option on `searchOwnCourses` continues to sort by
  enrollment count; this feature does not change ranking/sort behaviour, only adds the
  displayed numbers.

## Functional requirements

### Course card stats

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR1 | Course card | Each card's "Students" stat shows the count of distinct students with an active-or-completed enrollment in that specific course. |
| FR2 | Course card | Each card's "Rating" stat shows that course's average review rating to one decimal, or `—` if the course has no reviews. |
| FR3 | Course card | Each card's "Revenue" stat shows that course's lifetime gross revenue (succeeded, non-refunded payments), formatted as currency (e.g. `$1,230`). |
| FR4 | Course card | A course with zero enrollments, zero reviews, and zero payments (e.g. a brand-new draft) shows `0`, `—`, `$0` respectively — no crash, no leftover placeholder. |
| FR5 | Course card | Only the signed-in instructor's own course data ever appears; one instructor never sees another's numbers (enforced by the existing `searchOwnCourses` ownership scoping). |
| FR6 | Course card | Stats are accurate for every row on the current page, regardless of `sort`/`status`/`category`/`q` filters already supported by `searchOwnCourses`. |

## Non-functional requirements

| Aspect | Requirement |
|--------|-------------|
| Security / authz | Data flows through the existing `instructorProcedure`-backed `course.searchOwnCourses`; instructor id comes from the session, never client input. No cross-instructor leakage. |
| Performance | Fetching a page of N courses (N ≤ current page size) costs a small, bounded number of queries (course page query + batched rating aggregate + batched revenue aggregate) — never one query per course. |
| Reliability | If a course has no matching rows in the rating or revenue aggregate, it resolves to the documented zero/`—` default rather than an error or `undefined`. |
| Observability | No new logging requirements beyond what `courseService.searchOwnCourses` already does. |

## Success metrics

- On `/instructor/courses`, every visible card shows real, non-placeholder Students/
  Rating/Revenue numbers.
- A course's Students/Rating figures here match the same course's figures wherever else
  it's shown (e.g. if it appears in Top Performing Courses).
- A freshly created draft course shows `0` / `—` / `$0`, never `"-"` or a runtime error.

## Out of scope (deferred)

- Any change to `searchOwnCourses`'s sort/filter behaviour.
- Any change to the instructor-level "Total Students"/"Total Revenue" summary cards
  (`2026-06-18-instructor-courses-stats`, already shipped).
- "This month" deltas on the course card (the card shows lifetime figures only, same as
  Top Performing Courses).
- Any other consumer of `CourseCard` — none currently exists outside `/instructor/courses`.

## Open questions

- None — all clarifications resolved with the stakeholder.