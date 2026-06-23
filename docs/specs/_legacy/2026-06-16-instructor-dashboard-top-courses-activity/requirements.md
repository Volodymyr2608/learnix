# Requirements: Instructor Dashboard — Top Performing Courses & Recent Activity

> Design in [`spec.md`](./spec.md) · plan in [`plan.md`](./plan.md) · checks in [`validation.md`](./validation.md)

## Status: planned

Date: 2026-06-16 · Author: Volodymyr Pelykh · Stakeholder: Volodymyr Pelykh

## Problem

After the stat cards (`2026-06-16-instructor-dashboard-data`) and the revenue chart
(`2026-06-16-instructor-revenue`) were made real, two widgets on the instructor
dashboard remain **fully hardcoded** and identical for every instructor:

- **"Top Performing Courses"** renders three literal courses — "Complete Web Development
  Bootcamp / 456 students / $4,560 / 4.9", etc. (`app/instructor/page.tsx:43-87`). The
  list is the same regardless of which instructor is signed in, and none of the courses
  necessarily belong to them.
- **"Recent Activity"** renders five literal events — "Sarah Johnson enrolled in Web
  Development / 2 hours ago", a fabricated "New question in Web Development Q&A", etc.
  (`app/instructor/page.tsx:95-145`). The timestamps never change and one event type
  ("question") has **no backing model** in the schema at all.

An instructor cannot see which of their courses actually perform best, nor any real
signal that students are engaging with their content. The underlying data already
exists (`Enrollment`, `CourseReview`, `Payment`, `Course`) and is already aggregated for
the stat cards, but these two widgets never consume it.

## Goal

- An instructor sees **their own** top courses, ranked by real lifetime gross revenue,
  with each course's real student count and average rating.
- An instructor sees a **real, time-ordered feed** of recent enrollments and reviews
  across their courses, with truthful relative timestamps.
- A brand-new instructor with no courses / no activity sees a clear empty state instead
  of fabricated rows.
- The dashboard remains a Server Component fetching its data in a single round-trip,
  consistent with the existing stat-card and revenue-chart wiring.

## Scope decisions (locked)

1. **Both widgets in this feature** — "Top Performing Courses" and "Recent Activity" are
   wired to real data together; they share the same router/service/repository plumbing
   and sit side-by-side in the same `lg:grid-cols-2` row.
2. **Top Performing is ranked by lifetime gross revenue** (`SUM(amountCents)` of
   succeeded, non-refunded payments per course), mirroring the "$X revenue" framing of
   the existing card and scope decision #5 of `2026-06-16-instructor-dashboard-data`.
   Ranking by revenue does **not** hide the other metrics — each row still shows students
   and rating. Ties broken by student count, then by course title (deterministic order).
3. **Show the top 3 courses.** Each row shows: course title, student count,
   average rating, and lifetime gross revenue (formatted as currency). This matches the
   current card's three displayed metrics.
4. **Per-course "students" = distinct active-or-completed enrollments in that course.**
   A student who finished the course is still counted — only a `cancelled` enrollment is
   excluded. Consistent with the distinct-student framing of the stat cards (decision #6
   there).
5. **Per-course "rating" = average of that course's reviews**, or a neutral placeholder
   (`—`) when the course has no reviews yet.
6. **Recent Activity merges two event types only: new enrollments and new reviews.**
   The mock's "question" type is **dropped** (no Q&A model exists). Standalone
   "sales/payments" are **not** a separate type — a paid enrollment already implies a
   sale, so a separate sale event would double-count the same action.
7. **Recent Activity shows the most recent ~5 events**, newest first, merged across both
   types and across all of the instructor's courses, with a relative timestamp
   ("2 hours ago"). Course completions are **deferred** (see Out of scope).
8. **Empty states render real copy, not placeholder rows.** No courses → Top Performing
   shows an empty-state message; no enrollments/reviews → Recent Activity shows an
   empty-state message. A new instructor never sees fabricated names.
9. **Only the signed-in instructor's own data** is ever read; courses, enrollments, and
   reviews are scoped by instructor ownership.

## Assumptions & constraints

- Single currency (USD); all amounts are stored in cents on `Payment.amountCents`.
- "Gross revenue" = succeeded, non-refunded payments, consistent with the stat-card
  revenue definition already shipped.
- Enrollment recency uses `Enrollment.enrolledAt`; review recency uses
  `CourseReview.createdAt`.
- Only **published** courses are eligible for Top Performing (a draft cannot have sales);
  Recent Activity may reference any course the instructor owns that has activity.
- The dashboard is and stays a Server Component; no client-side polling or realtime.

## Functional requirements

### Top Performing Courses

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR1 | Top Performing card | Given an instructor with ≥1 course that has revenue, the card lists their top 3 courses ordered by lifetime gross revenue (descending). |
| FR2 | Top Performing card | Each row shows the real course title, its student count (active + completed enrollments), its average rating (or `—` if none), and its lifetime gross revenue formatted as currency. |
| FR3 | Top Performing card | Only courses owned by the signed-in instructor appear; no other instructor's course is ever shown. |
| FR4 | Top Performing card | Ties on revenue are broken by student count (desc), then course title (asc), so order is deterministic. |
| FR5 | Top Performing card | Given an instructor with no courses (or no courses with any revenue), the card shows an empty-state message instead of rows. |
| FR6 | Top Performing card | The "View All" link continues to navigate to the instructor courses list. |

### Recent Activity

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR7 | Recent Activity card | The feed shows up to 5 most-recent events merged from new enrollments and new reviews across all of the instructor's courses, newest first. |
| FR8 | Recent Activity card | An enrollment event reads as a student enrolling in a named course; a review event reads as a new rating/review on a named course. Wording is generated from real records. |
| FR9 | Recent Activity card | Each event shows a relative timestamp derived from the record's timestamp (`enrolledAt` / `createdAt`), e.g. "2 hours ago", "3 days ago". |
| FR10 | Recent Activity card | Each event renders the icon that matches its real type (enrollment vs review); no "question" type is rendered. |
| FR11 | Recent Activity card | Only activity on the signed-in instructor's own courses is shown. |
| FR12 | Recent Activity card | Given an instructor with no enrollments and no reviews, the card shows an empty-state message instead of rows. |

## Non-functional requirements

| Aspect | Requirement |
|--------|-------------|
| Security / authz | Both widgets read only via an `instructorProcedure`; instructor ID comes from the session, never from client input. No cross-instructor data leakage. |
| Performance | Each widget is a bounded aggregation (top 3 courses; 5 activity rows). Avoid N+1 — counts/ratings/revenue per course fetched in aggregate, and the activity feed fetched without per-row follow-up queries. The whole dashboard stays a single server round-trip. |
| Reliability | Each fetch degrades to an empty result on error (mirrors `getDashboardStats`/`getRevenueTimeSeries` try/catch fallbacks) so one failing widget never blanks the page. |
| Accessibility / UX | Empty states use readable copy; timestamps are human-relative; icons have accessible treatment consistent with existing cards. |
| Observability | Service-level logging consistent with `getDashboardStats` (instructor ID, no PII beyond what is already logged). |

## Success metrics

- 100% of instructors see only their own courses/activity (no shared mock values).
- A new instructor (no courses, no activity) sees empty states, never fabricated rows.
- Top Performing order matches a manual revenue ranking for a seeded instructor.

## Out of scope (deferred)

- **Course completions** as a Recent Activity event type (would add a `CourseProgress`
  aggregation) — may be added later if the feed feels sparse.
- **Quiz attempts** or lesson-level engagement as activity events.
- Pagination / "load more" or realtime updates for Recent Activity.
- Configurable ranking metric for Top Performing (students/rating toggle).
- Any change to the stat cards or the revenue chart (already shipped).

## Open questions

- None — all clarifications resolved with the stakeholder.