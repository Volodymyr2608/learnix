# Requirements: Dynamic "New Reviews" Sidebar Badge

> Design in [`spec.md`](./spec.md) · plan in [`plan.md`](./plan.md) · checks in [`validation.md`](./validation.md)

## Status: planned — instructor portal

Date: 2026-06-19 · Author: Volodymyr Pelykh · Stakeholder: Volodymyr Pelykh

## Problem

The instructor sidebar shows a hardcoded badge of `5` on the Reviews nav item
(`app/_components/Dashboard/Sidebar/components/Navigation/index.tsx:61`, `badge: "5"`). Every
instructor sees the same `5` forever — it never reflects real reviews, never changes, and can never
be cleared. It reads as "5 things needing attention" but means nothing. (The same file also carries
fake Messages badges `"2"`/`"3"` for a messaging feature that does not exist — see Out of scope.)

The platform now has a real instructor Reviews dashboard backed by real `CourseReview` data
(`docs/specs/2026-06-19-instructor-reviews-dashboard`), so the badge can and should reflect actual
new feedback the instructor has not yet seen.

## Goal

- The Reviews nav badge shows the real number of **new** reviews the instructor has not yet looked
  at — feedback left since they last opened the Reviews page — and disappears when there are none.
- Opening the Reviews page is what "reads" the feedback: the badge clears automatically after a
  visit, with no manual dismiss step.
- A brand-new instructor (no reviews) never sees a badge; the rollout does not flash a large badge
  of historical reviews at existing instructors.

## Scope decisions (locked)

1. **"New" = created since last visit.** The badge counts non-deleted reviews on the instructor's
   non-deleted courses whose `createdAt` is after the instructor's `reviewsLastViewedAt`, across all
   their courses — an unread-style indicator, not a "needs attention / low rating" filter. — rules
   out counting by rating or showing a constantly-visible lifetime total.
2. **Opening the Reviews page clears it.** Visiting `/instructor/reviews` stamps
   `reviewsLastViewedAt = now()`; the badge recomputes to 0. No "mark all read" button. — rules out
   a separate dismiss affordance.
3. **The stamp happens on open, regardless of filters.** Landing on any view of the page (including
   a filtered or empty result) counts as reading and clears the badge. — confirmed with stakeholder.
4. **Reviews arriving while the instructor is on the page surface on the next visit.** v1 does not
   live-update the badge for reviews created during the current visit. — confirmed with stakeholder.
5. **Backfill existing instructors to `now()`.** At migration, `reviewsLastViewedAt` is set to the
   migration time for existing instructors so historical reviews are not counted as new on rollout.
   — rules out existing instructors seeing a sudden large badge.
6. **Reviews-only.** The fake Messages badges are not part of this feature. — keeps scope to the one
   badge that now has real backing data.

## Assumptions & constraints

- The badge is instructor-only: the Reviews nav item exists only in the instructor sidebar, so the
  count is computed only for instructors (`isInstructor`), never for students.
- "Reviews for the instructor" means non-deleted `CourseReview` rows whose course is owned by the
  current instructor and not deleted — the same scoping used across the reviews dashboard
  (`server/repositories/courseReview.repository.ts`).
- Access is via the authenticated instructor; the instructor id comes from `ctx.session.user.id`
  through `instructorProcedure`, never from client input.
- `reviewsLastViewedAt` lives on `InstructorProfile` (`prisma/schema/instructor.prisma`), which is
  already 1:1 with the instructor `User`.
- Must follow the three-layer pattern (router → service → repository) and the `CLAUDE.md` component
  conventions; the badge fetch reuses the existing RSC request-helper pattern
  (`lib/requests/instructor/*`).

## Functional requirements

### Sidebar badge

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR1 | Reviews nav badge | Shows the count of new reviews (decision #1) for the current instructor; the badge element is absent when the count is 0. |
| FR2 | Large counts | A count greater than 9 displays as `9+`. |
| FR3 | Non-instructors | A student never sees a reviews badge, and the count query is not invoked for non-instructors. |
| FR4 | No hardcoded value | The literal `badge: "5"` on the Reviews item is gone; the value is data-driven. |

### Clearing

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR5 | Clear on open | After the instructor opens `/instructor/reviews`, the sidebar badge clears to 0 without a manual page refresh, within the same visit. |
| FR6 | Stamp persists | `reviewsLastViewedAt` is updated to the open time and persists, so the cleared state survives navigation and reload. |
| FR7 | Idempotent / safe | Opening the page when there are zero reviews (or repeatedly) stamps harmlessly and never errors. |

### Data & rollout

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR8 | New column | `InstructorProfile.reviewsLastViewedAt` (nullable timestamp) persists per instructor. |
| FR9 | Backfill | After migration, existing instructors have `reviewsLastViewedAt` set to the migration time, so no historical reviews count as new (decision #5). |
| FR10 | Null safety | If `reviewsLastViewedAt` is null, the count includes all current reviews (defensive — a new instructor has none anyway). |

## Non-functional requirements

| Aspect | Requirement |
|--------|-------------|
| Security / authz | Both procedures are `instructorProcedure`, scoped to `ctx.session.user.id`; no id is accepted from the client; one instructor's count never reflects another's reviews. |
| Performance | The badge adds at most one `COUNT` query to the layout render, and only for instructors; no rows are loaded into JS; no N+1. |
| Reliability | A failed count fetch degrades to no badge (0), never a crashed sidebar; a failed mark-viewed is logged and does not block the Reviews page from rendering. |
| Accessibility / UX | The badge has an accessible label conveying it is a count of new reviews; it is not conveyed by color alone. |
| Observability | The count and mark-viewed operations log the instructor id, consistent with existing instructor service logging. |
| Data / privacy | Only a single timestamp is added; no review content is duplicated or cached. |

## Success metrics

- An instructor with N new reviews since their last visit sees a badge of N (or `9+`); after opening
  the Reviews page the badge is gone on the next sidebar render and stays gone on reload.
- A brand-new instructor and an existing instructor immediately after rollout both see no badge
  until a genuinely new review arrives.
- Two instructors see independent counts matching their own data; students see no badge.

## Out of scope (deferred)

- The fake **Messages** badges (`"2"`/`"3"`) — a messaging feature does not exist; left for a
  separate cleanup.
- A manual "mark all read" / dismiss button, per-course badges, or marking individual reviews read.
- Real-time/live badge updates (web sockets, polling) while the instructor sits on a page.
- Email or in-app notifications when a new review arrives.
- Any change to how/when students create reviews.

## Open questions

- None.