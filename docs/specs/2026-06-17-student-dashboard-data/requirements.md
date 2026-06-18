# Requirements: Student Dashboard — Real Data

> Design in [`spec.md`](./spec.md) · plan in [`plan.md`](./plan.md) · checks in [`validation.md`](./validation.md)

## Status: planned

Date: 2026-06-17 · Author: Volodymyr Pelykh · Stakeholder: Volodymyr Pelykh

## Problem

The student dashboard at `app/dashboard/page.tsx` renders hardcoded placeholder data
identical for every student:

- The four stat cards show literal constants — `12` enrolled courses, `48.5` hours
  learned, `5` certificates, `87%` completion rate (`app/dashboard/page.tsx:35-74`).
- Each card's trend subline is a static string — `"+2 from last month"`,
  `"+12.5 from last week"`, `"+1 this month"`, `"+5% from last month"`
  (`app/dashboard/page.tsx:36,48,60,73`).
- "Continue Learning" lists three fabricated courses with invented progress and lesson
  labels (`app/dashboard/page.tsx:85-100`); the items are not links.

A student cannot see their actual learning state from the dashboard. The backing data
already exists — `Enrollment` (status, progress, `enrolledAt`, `completedAt`,
`lastAccessedAt`), `LessonProgress` (`isCompleted`, `completedAt`), and certificates are
already derived from completed enrollments (`certificateService.renderPdf` keys off
`Enrollment.completedAt`, `server/services/certificates/certificate.service.ts:13`) — but
the page consumes none of it. The `RecommendedRail` below is already dynamic
(`app/dashboard/page.tsx:14,126`).

## Goal

- A student sees their own real enrolled-course count, hours learned, certificates
  earned, and completion rate on the dashboard stat cards.
- The count-based cards show a true month-over-month change instead of a fixed string.
- "Continue Learning" lists the student's actual in-progress courses, deep-links into the
  next lesson to resume, and shows a sensible empty state when nothing is in progress.
- A brand-new student with no enrollments sees zeroed values and empty-state copy rather
  than misleading numbers.
- The dashboard remains a Server Component fetching its data in a single round-trip.

## Scope decisions (locked)

1. **All four stat cards become real from existing tables — no schema changes.** The
   cards are Enrolled Courses, Hours Learned, Certificates, and Completion Rate.
2. **"Hours Learned" stays, now backed by `Lesson.durationMinutes`.** The free-text
   `Lesson.duration String?` was replaced by a numeric `durationMinutes Int?`
   (`prisma/schema/lesson.prisma`), and the student-progress feature already aggregates
   completed minutes (`lessonProgressRepository.getCompletedMinutesTotals`,
   `StudentProgressStats.totalMinutes`). Hours Learned = sum of `durationMinutes` over the
   student's completed lessons, formatted to hours. No new structured duration field is
   introduced — the column already exists.
3. **No new Certificate model.** A certificate already *is* a completed enrollment
   (the certificate PDF is rendered from `Enrollment.completedAt`); the count is therefore
   `COUNT(Enrollment WHERE completedAt IS NOT NULL)` for the student.
4. **Compute real month-over-month deltas for the three trend cards** — Enrolled
   Courses (by `enrolledAt`), Hours Learned (sum of `durationMinutes` for lessons whose
   `LessonProgress.completedAt` falls in the window), and Certificates
   (`Enrollment.completedAt`). All use calendar-month windows in server local time, for one
   consistent comparison period. (Note: the existing `getCompletedMinutesTotals` uses
   trailing-7-day windows for the progress page; the dashboard needs a month-bucketed
   minutes sum instead — see `spec.md`.)
5. **Completion Rate has no delta.** We do not store historical progress snapshots, so a
   prior-period completion rate cannot be computed from current data. The card shows a
   static descriptive subline instead of a trend.
6. **Deltas are suppressed when there is no prior-period data** to compare against, to
   avoid divide-by-zero and misleading percentages.
7. **Continue Learning shows in-progress enrollments only** (`0 < progress < 100`),
   ordered by `lastAccessedAt` (most recent first), capped at 3, each deep-linking to the
   next incomplete lesson. Completed (100%) and not-yet-started (0%) courses are excluded.
8. **`RecommendedRail` is unchanged** — it is already dynamic and out of scope.

## Assumptions & constraints

- Access is restricted to the authenticated student; the endpoint uses `studentProcedure`
  and scopes every query to `ctx.session.user.id`. No student id is accepted from the
  client.
- "Current month" / "last month" are calendar months in server local time, consistent
  with the month-window logic already used on the instructor dashboard
  (`server/repositories/course.repository.ts`).
- Completion Rate = completed courses ÷ total enrolled courses, expressed as a whole
  percentage. With zero enrolled courses it renders `0%`.
- `Lesson.durationMinutes` is nullable (instructor-supplied); lessons without it count as
  0 minutes, so Hours Learned may undercount until instructors populate durations. This is
  accepted — it degrades gracefully rather than blocking the metric.
- The "next incomplete lesson" for a course is the lesson with the lowest `order` (across
  sections in order) that has no completed `LessonProgress` for the student.
- Must follow the existing three-layer pattern (router → service → repository) and the
  component conventions in `CLAUDE.md` (colocated `types.ts`, no nested ternaries in JSX,
  extracted sub-components, flattened loading states).

## Functional requirements

### Stat cards

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR1 | Enrolled Courses card | Shows the count of the student's `active` enrollments. With none, shows `0`. |
| FR2 | Enrolled Courses delta | Shows the change in number of enrollments created (`enrolledAt`) this calendar month vs last. Positive/negative are visually distinguished (text/icon, not color alone). When last month = 0 and this month > 0, shows "New"; when both = 0, the delta is hidden. |
| FR3 | Hours Learned card | Shows the sum of `Lesson.durationMinutes` over the student's completed lessons (`LessonProgress.isCompleted = true`), formatted to hours (one decimal). Lessons with a null `durationMinutes` contribute 0. With none, shows `0`. |
| FR4 | Hours Learned delta | Shows the change in hours learned (summing `durationMinutes` for lessons whose `LessonProgress.completedAt` falls in each window) this calendar month vs last, with the same zero-handling rules as FR2. |
| FR5 | Certificates card | Shows the count of the student's enrollments where `completedAt IS NOT NULL`. With none, shows `0`. |
| FR6 | Certificates delta | Shows the change in certificates earned (`Enrollment.completedAt`) this calendar month vs last, with the same zero-handling rules as FR2. |
| FR7 | Completion Rate card | Shows completed courses ÷ total enrolled courses as a whole percentage. With zero enrolled courses, shows `0%`. The subline is a static descriptor (e.g. "Across enrolled courses"); no delta is shown. |
| FR8 | Single fetch | All four cards are populated from one tRPC query fetched once in the Server Component; no per-card client fetches. |
| FR9 | Authorization | The endpoint is a `studentProcedure`; all aggregates are scoped to the calling student's id and never accept a student id from the client. |

### Continue Learning

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR10 | In-progress list | Shows up to 3 of the student's enrollments with `0 < progress < 100`, ordered by `lastAccessedAt` descending. Completed and not-started courses are excluded. |
| FR11 | Item content | Each item shows the course title, the next incomplete lesson (lowest-`order` lesson with no completed `LessonProgress`), and the enrollment's progress percentage. |
| FR12 | Resume link | Each item links to `/dashboard/courses/[courseId]/learn/[lessonId]` for the next incomplete lesson, so the student resumes where they left off. |
| FR13 | Empty state | When the student has no in-progress enrollments, the section shows empty-state copy (e.g. "No courses in progress") instead of an empty list. |

## Non-functional requirements

| Aspect | Requirement |
|--------|-------------|
| Security / authz | `studentProcedure` only; student id sourced from session, never client input. No cross-student data leakage. |
| Performance | Single endpoint; aggregates run concurrently; no N+1 over enrollments or lessons when resolving the next lesson for Continue Learning. |
| Accessibility / UX | Zeroed values and empty-state copy for new students; delta direction conveyed by text/icon, not color alone; Continue Learning items are keyboard-focusable links. |
| Observability | The service logs the aggregation with the student id, consistent with existing service logging. |

## Success metrics

- Two different students loading the dashboard see different, correct figures matching
  their own data (verifiable against the database / Prisma Studio).
- A newly created student account sees `0 / 0 / 0 / 0%`, an empty Continue Learning state,
  and no fabricated deltas or runtime errors.
- Clicking a Continue Learning item lands the student on the correct next lesson of that
  course.

## Out of scope (deferred)

- Any new `Certificate` model or structured lesson-duration field (`durationMinutes`
  already exists).
- Backfilling `durationMinutes` for lessons that lack it (instructor-entered over time).
- Completion Rate trend over time (requires historical progress snapshots).
- Changes to `RecommendedRail` (already dynamic).
- Date-range filtering or custom comparison periods.
- Streaks, badges, or other gamification widgets.

## Open questions

- None.