# Requirements: Real Data for OwnCoursesStats (Instructor Courses Page)

> Design in [`spec.md`](./spec.md) · plan in [`plan.md`](./plan.md) · checks in [`validation.md`](./validation.md)

## Status: planned — instructor portal

Date: 2026-06-18 · Author: Volodymyr Pelykh · Stakeholder: Volodymyr Pelykh

## Problem

`OwnCoursesStats` (`app/_components/Course/components/OwnCoursesStats/index.tsx`), shown at the
top of `/instructor/courses`, only wires real data into half of its four cards:

- "Total Courses" and "Published" are real, backed by `courseRepository.getCoursesStats`
  (`app/_components/Course/components/OwnCoursesStats/index.tsx:10`, `:19`, `:30`).
- "Total Students" is a hardcoded `1,234` with a hardcoded `+87 this month` subline
  (`app/_components/Course/components/OwnCoursesStats/index.tsx:39-40`).
- "Total Revenue" is a hardcoded `$12,450` with a hardcoded `+$1,230 this month` subline
  (`app/_components/Course/components/OwnCoursesStats/index.tsx:48-49`).

Every instructor sees the same two fake numbers regardless of how many students they actually
have or how much they've actually earned. The backing data already exists and is already
aggregated for the instructor dashboard:
`enrollmentRepository.getInstructorStudentStats` returns `{ total, thisMonthNew, lastMonthNew }`
(`server/repositories/enrollment.repository.ts:282`), scoped to active enrollments in courses the
instructor owns, and `paymentRepository.getInstructorRevenueStats` returns
`{ lifetimeGrossCents, thisMonthGrossCents, lastMonthGrossCents }`
(`server/repositories/payment.repository.ts:56`), scoped to succeeded, non-refunded payments for
the instructor. Both are already consumed by `instructorService.getDashboardStats`
(`server/services/instructor/instructor.service.ts:90`) for the instructor dashboard — nothing
analogous feeds the courses page.

## Goal

- An instructor visiting `/instructor/courses` sees their own real total student count and real
  lifetime revenue on the stats row, matching the same figures shown elsewhere in the app for the
  same instructor (instructor dashboard).
- The "this month" sublines under Total Students and Total Revenue reflect real new-student and
  new-revenue activity for the current calendar month, not fixed mock text.
- A brand-new instructor with no students or sales sees zeroed values and a sensible subline,
  never a fabricated number or a runtime error.

## Scope decisions (locked)

1. **Reuse existing aggregates, don't recompute.** Student totals and revenue totals are sourced
   from `enrollmentRepository.getInstructorStudentStats` and
   `paymentRepository.getInstructorRevenueStats` — the same repository methods already powering
   the instructor dashboard — so the courses page and dashboard can never disagree for the same
   instructor.
2. **Sublines stay in the page's existing absolute-count style, not the dashboard's
   percentage-delta style.** The "Total Courses" card on this same page already shows an absolute
   count ("+N this month"), so "Total Students" shows "+N students this month" and "Total Revenue"
   shows "+$N this month" (both can read "+0" with no activity) — rules out introducing the
   dashboard's `DeltaBadge` (up/down %, "New this month", color-coded arrows) onto this page.
3. **Total Revenue here means the same lifetime gross definition used by the dashboard's Total
   Revenue card** (`SUM(amountCents)` over succeeded, non-refunded payments) — rules out showing
   net/payout figures on this card.

## Assumptions & constraints

- "Total Students" counts distinct students with an **active** enrollment in a course owned by
  the current instructor — identical definition to the dashboard's existing Total Students card,
  so the two never diverge for the same instructor.
- "This month" is the current calendar month in server local time, consistent with the existing
  dashboard delta windows (`lib/stats/monthWindows.ts`).
- Access is restricted to the authenticated instructor; the instructor id comes from
  `ctx.session.user.id` via the existing `instructorProcedure`, never from client input.
- Must follow the three-layer pattern (router → service → repository) and the `CLAUDE.md`
  component conventions (colocated `types.ts`, no nested ternaries, flattened loading states).
- No new database aggregation is required — both source repository methods already exist and are
  tested via the instructor dashboard feature.

## Functional requirements

### Courses page — stats row

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR1 | Total Students card | Shows the distinct count of students with an active enrollment in any course owned by the current instructor. |
| FR2 | Total Students subline | Shows the number of students newly enrolled this calendar month, formatted as "+N students this month" (N may be 0). |
| FR3 | Total Revenue card | Shows lifetime gross sales for the instructor (`SUM(amountCents)` where `instructorId` = current user, `status = succeeded`, `refundedAt = null`), formatted as USD. |
| FR4 | Total Revenue subline | Shows this calendar month's gross sales as a dollar amount, formatted as "+$N this month" (N may be 0). |
| FR5 | New instructor / zero state | With zero students and zero sales, the cards show "0" / "$0" and "+0 students this month" / "+$0 this month" — no crash, no fallback to the old mock numbers. |
| FR6 | Cross-page consistency | For a given instructor, the Total Students and Total Revenue figures on `/instructor/courses` equal the corresponding figures on the instructor dashboard at the same point in time. |

## Non-functional requirements

| Aspect | Requirement |
|--------|-------------|
| Security / authz | Data is served via `instructorProcedure`, scoped to `ctx.session.user.id`; no instructor id accepted from the client; one instructor never sees another's student or revenue figures. |
| Performance | Student and revenue aggregates run concurrently with the existing course-count aggregate (no added sequential round-trips); no N+1 over enrollments or payments. |
| Reliability | A transient data-fetch failure degrades gracefully (zeroed cards), consistent with the existing `getCoursesStats` fallback pattern (`lib/requests/course/getCoursesStats.ts:4-13`). |
| Accessibility / UX | No new interactive elements; existing card markup and contrast are unchanged. |
| Observability | Aggregation logs the instructor id, consistent with existing repository/service logging. |
| Data / privacy | No new data persisted; figures are derived from existing `Enrollment` and `Payment` rows. |

## Success metrics

- An instructor with students and sales sees real, correct Total Students and Total Revenue
  figures on `/instructor/courses` that match Prisma Studio and match the instructor dashboard.
- A newly created instructor account sees zeroed cards and zeroed sublines, with no runtime
  errors and no leftover mock numbers (`1,234`, `$12,450`, `+87`, `+$1,230`).
- Two different instructors see different, correct figures matching their own data.

## Out of scope (deferred)

- Switching this page's sublines to the dashboard's percentage-delta / `DeltaBadge` style.
- Payout/net-revenue breakdown (paid out vs. pending) — that lives on `/instructor/revenue`.
- Any new chart, time-range selector, or per-course breakdown on this page.
- Changes to the "Total Courses" / "Published" cards, which are already real.

## Open questions

- None.