# Requirements: Instructor Dashboard — Real Stat Cards

> Design in [`spec.md`](./spec.md) · plan in [`plan.md`](./plan.md) · checks in [`validation.md`](./validation.md)

## Status: planned

Date: 2026-06-16 · Author: Volodymyr Pelykh · Stakeholder: Volodymyr Pelykh

## Problem

The instructor dashboard at `app/instructor/page.tsx` renders entirely hardcoded
placeholder data. Every figure is fabricated and identical for all instructors:

- The four stat cards show literal constants — `$12,450` revenue, `1,234` students,
  `8` active courses / `2` drafts, `4.8` rating / `245` reviews
  (`app/instructor/page.tsx:39-101`).
- The "% from last month" deltas (`12.5%`, `8.2%`) are static strings
  (`app/instructor/page.tsx:41-42`, `59-60`).

An instructor cannot see their actual teaching performance from the dashboard. The
backend already exposes most of this data — `paymentService.getInstructorEarnings`
(`server/services/payments/payment.service.ts:187`) and
`courseRepository.getCoursesStats` (`server/repositories/course.repository.ts:123`) —
but the page does not consume it.

## Goal

- An instructor sees their own real revenue, student count, course counts, and average
  rating on the dashboard stat cards.
- Revenue and student cards show a true month-over-month change instead of a fixed string.
- A brand-new instructor with no sales, students, or reviews sees sensible zeroed values
  and empty-state copy rather than misleading numbers.
- The dashboard remains a Server Component fetching its data in a single round-trip.

## Scope decisions (locked)

1. **Only the four stat cards** are made real in this feature — Total Revenue, Total
   Students, Active Courses, Avg. Rating. Keeps the change focused and shippable.
2. **"Top Performing Courses", "Recent Activity", and "Revenue Overview" chart stay as
   they are** (mocked / placeholder) and are deferred — they each need their own
   aggregation work and are tracked as future features.
3. **Keep the month-over-month deltas and compute them for real** — applied only to the
   Revenue and Students cards (the two cards that show a delta in the current design).
   The Courses card keeps its `"{n} drafts"` sub-line and the Rating card keeps its
   `"{n} reviews"` sub-line; neither gets a delta.
4. **Empty data renders zeroed values + empty-state copy** (e.g. `$0`, `0`, `—`, "No
   reviews yet"); deltas are suppressed when there is no prior-period data to compare
   against. Avoids divide-by-zero and misleading percentages.
5. **Total Revenue = lifetime gross sales** (`SUM(amountCents)` of succeeded,
   non-refunded payments), not instructor net — it mirrors the "$12,450 revenue" framing
   of the current card; net/owed earnings already live on the payments/Connect surface.
6. **Total Students = distinct students** across the instructor's courses (a student
   enrolled in two of their courses counts once), not total enrollments.

## Assumptions & constraints

- Single currency (USD); all amounts are stored in cents on `Payment.amountCents`.
- "Current month" / "last month" are calendar months in server local time, consistent
  with the existing `getCoursesStats` month-window logic
  (`server/repositories/course.repository.ts:127-130`).
- Access is restricted to the authenticated instructor; the endpoint uses
  `instructorProcedure` and scopes every query to `ctx.session.user.id`.
- Must follow the existing three-layer pattern (router → service → repository) and the
  component conventions in `CLAUDE.md` (colocated `types.ts`, no nested ternaries,
  extracted sub-components).

## Functional requirements

### Stat cards

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR1 | Total Revenue card | Shows lifetime gross sales for the instructor = sum of `amountCents` over `Payment` rows where `instructorId` = current user, `status = succeeded`, `refundedAt = null`, formatted as USD. With no payments, shows `$0`. |
| FR2 | Total Revenue delta | Shows the percentage change between current-month and last-month gross sales (same filter, bucketed by `createdAt`). Up/positive and down/negative are visually distinguished. When last month = 0 and this month > 0, shows "New" (no percentage); when both months = 0, the delta is hidden. |
| FR3 | Total Students card | Shows the count of distinct students with an `active` enrollment in any course owned by the instructor. With no enrollments, shows `0`. |
| FR4 | Total Students delta | Shows the percentage change between new enrollments created this month vs last month across the instructor's courses, with the same zero-handling rules as FR2. |
| FR5 | Active Courses card | Shows the count of the instructor's `published` courses; sub-line shows `"{n} drafts"` using the draft count. No delta. Reuses existing `getCoursesStats`. |
| FR6 | Avg. Rating card | Shows the average `rating` (1 decimal) over non-deleted `CourseReview` rows for the instructor's courses; sub-line shows `"{n} reviews"`. With no reviews, shows `—` and "No reviews yet". No delta. |
| FR7 | Single fetch | All four cards are populated from one tRPC query (`instructor.getDashboardStats`) fetched once in the Server Component; no per-card client fetches. |
| FR8 | Authorization | The endpoint is an `instructorProcedure`; all aggregates are scoped to the calling instructor's id and never accept an instructor id from the client. |

## Non-functional requirements

| Aspect | Requirement |
|--------|-------------|
| Security / authz | `instructorProcedure` only; instructor id sourced from session, never client input. No cross-instructor data leakage. |
| Performance | Single endpoint; aggregates run concurrently (`Promise.all`); no N+1 over courses. |
| Accessibility / UX | Zeroed values and empty-state copy for new instructors; delta direction conveyed by text/icon, not color alone. |
| Observability | Service logs the aggregation with the instructor id, consistent with existing service logging. |

## Success metrics

- Two different instructors loading the dashboard see different, correct figures matching
  their own data (verifiable against the database / Prisma Studio).
- A newly created instructor account sees `$0 / 0 / 0 published, 0 drafts / —` with no
  runtime errors and no fabricated deltas.

## Out of scope (deferred)

- "Top Performing Courses" list (per-course ranked aggregation).
- "Recent Activity" feed (merged enrollments + reviews timeline).
- "Revenue Overview" time-series chart.
- Instructor net earnings / payout balances on the dashboard (already on the payments surface).
- Date-range filtering or custom comparison periods.

## Open questions

- None.