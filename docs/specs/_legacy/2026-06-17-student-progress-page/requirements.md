# Requirements: Student Progress Page — Real Data

> Design in [`spec.md`](./spec.md) · plan in [`plan.md`](./plan.md) · checks in [`validation.md`](./validation.md)

## Status: planned

Date: 2026-06-17 · Author: Volodymyr Pelykh · Stakeholder: Volodymyr Pelykh

## Problem

The student progress page at `app/dashboard/progress/page.tsx` renders entirely
hardcoded placeholder data, identical for every student:

- The four stat cards are literal constants — `156.5` total hours / `+23.7 this week`,
  `8` courses completed / `+2 this month`, `12 days` current streak, `3.4 hrs` avg. daily
  time (`app/dashboard/progress/page.tsx:64-114`).
- "Weekly Activity" is a fixed seven-day array of fabricated hours
  (`app/dashboard/progress/page.tsx:12-20`).
- "Achievements" and "Skill Progress" are fabricated lists
  (`app/dashboard/progress/page.tsx:22-51`).

A student cannot see their real learning progress. The platform also has no numeric
notion of how long a lesson takes: `Lesson.duration` is an instructor/AI-authored
free-text `String?` (e.g. "10 min") used only for display, so no hours can be summed from
it. Completion timestamps that *could* drive per-day activity already exist
(`LessonProgress.completedAt`, `Enrollment.completedAt`) but are unused on this page.

## Goal

- A student sees their own real total learning hours, courses completed, current study
  streak, average daily time, and a seven-day activity chart.
- "Hours" are derived from real lesson lengths, not invented, so two students with
  different histories see different, correct figures.
- A brand-new student with no completed lessons sees zeroed values, an empty/flat activity
  chart, and a `0`-day streak — never fabricated numbers.
- The page remains a Server Component fetching its data in a single round-trip.

## Scope decisions (locked)

1. **Five widgets become real:** Total Hours, Courses Completed, Current Streak, Avg. Daily
   Time, and the Weekly Activity chart. These are the time/count widgets the page is built
   around.
2. **Achievements and Skill Progress are deferred** — left as-is (static) for now. Each
   needs its own subsystem (an achievement rules engine; a skill taxonomy + per-skill
   proficiency model) and is tracked as a future feature.
3. **Hours come from lesson content length, not time-on-page** ("Approach A"). A new
   numeric lesson duration is summed over the student's *completed* lessons and bucketed by
   the completion date. We are explicitly **not** building activity/heartbeat tracking now;
   the metrics measure *content completed per day*, which is honest and meaningful for a
   learning platform, and can be upgraded to true engagement-time tracking later.
4. **The free-text `Lesson.duration` is replaced by a structured numeric duration.** A
   single numeric source of truth avoids keeping two redundant duration fields in sync. The
   existing free-text values are migrated by best-effort parsing; anything unparseable is
   treated as unknown (counts as zero toward hours). Display formats the number back to a
   human-readable string, so the curriculum/preview UI keeps showing a duration.
5. **Day boundaries are calendar days in server local time**, consistent with the
   month-window logic used elsewhere in the app.

## Assumptions & constraints

- Access is restricted to the authenticated student; the data endpoint is scoped to
  `ctx.session.user.id` and never accepts a student id from the client.
- A lesson with no known duration contributes `0` to hours (it does not break aggregation).
- "Hours" displayed to the student are rounded to one decimal place; daily chart values may
  be shown in minutes or hours as the design sees fit.
- Changing the lesson duration field affects every producer/consumer of the current
  free-text value — the curriculum form, the lesson editor, the AI course builder (its
  curriculum extraction schema/output) and the AI preview card — all must be updated so the
  app still builds and the AI flow still produces valid curricula.
- Must follow the existing three-layer pattern (router → service → repository) and the
  component conventions in `CLAUDE.md` (colocated `types.ts`, no nested ternaries in JSX,
  extracted sub-components, flattened loading states).

## Functional requirements

### Stat cards

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR1 | Total Hours card | Shows the student's lifetime learning hours = sum of the numeric duration of every lesson the student has completed, formatted to one decimal. With no completed lessons, shows `0`. |
| FR2 | Total Hours delta | Shows the change in hours completed in the trailing 7 days vs the 7 days before that. Positive/negative are visually distinguished (text/icon, not color alone) and the delta is hidden when there is no prior-period data. |
| FR3 | Courses Completed card | Shows the count of the student's enrollments with `completedAt` set. With none, shows `0`. |
| FR4 | Courses Completed delta | Shows the change in courses completed this calendar month vs last, with the same zero-handling rules as FR2. |
| FR5 | Current Streak card | Shows the number of consecutive calendar days, ending today (or yesterday if nothing has been completed yet today), on which the student completed at least one lesson. With no activity, shows `0 days`. |
| FR6 | Avg. Daily Time card | Shows the mean of the seven daily values in the Weekly Activity window (FR7), formatted as hours. With no activity in the window, shows `0`. |

### Weekly Activity

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR7 | Weekly Activity chart | Shows exactly seven bars for the trailing seven calendar days ending today, labelled by weekday. Each bar's value = total duration of lessons the student completed on that day. A day with no completions renders as an empty/zero bar (the day still appears). |

### Delivery

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR8 | Single fetch | All five widgets are populated from one tRPC query fetched once in the Server Component; no per-widget client fetches. |
| FR9 | Authorization | The endpoint is a `studentProcedure`; all aggregates are scoped to the calling student's id and never accept a student id from the client. |
| FR10 | Lesson duration capture | Instructors set a lesson's duration as a number (minutes) in the curriculum form and lesson editor; the value persists and is displayed back in a human-readable form wherever the old free-text duration was shown. |
| FR11 | AI builder compatibility | The AI course builder produces lessons whose duration is the new numeric field; generated curricula validate and persist without referencing the removed free-text field. |
| FR12 | Duration backfill | Existing lessons' free-text durations are migrated to the numeric field by best-effort parsing; values that cannot be parsed become unknown (null) and count as `0` toward hours, without error. |

## Non-functional requirements

| Aspect | Requirement |
|--------|-------------|
| Security / authz | `studentProcedure` only; student id sourced from session, never client input. No cross-student data leakage. |
| Performance | Single endpoint; aggregates run concurrently; per-day bucketing done in the query/service, no N+1 over lessons. |
| Accessibility / UX | Zeroed values and a flat chart for new students; delta direction conveyed by text/icon, not color alone; chart bars labelled and readable. |
| Reliability | Migration of the duration field and its backfill are reversible/safe; the page degrades to zeroed values rather than crashing on a data-fetch error. |
| Observability | The service logs the aggregation with the student id, consistent with existing service logging. |

## Success metrics

- Two different students loading the progress page see different, correct figures matching
  their own completion history (verifiable against the database / Prisma Studio).
- A newly created student account sees `0` hours, `0` courses, a `0`-day streak, `0` avg.
  daily time, and a flat seven-day chart, with no runtime errors and no fabricated deltas.
- After the migration, the curriculum form, lesson editor, AI course builder, and preview
  card all build and operate against the numeric duration with no broken references.

## Out of scope (deferred)

- Real time-on-page / engagement-time tracking ("Approach B": a `LearningActivity` model
  fed by client heartbeats).
- The "Achievements" widget (needs an achievement rules engine).
- The "Skill Progress" widget (needs a skill taxonomy and per-skill proficiency model).
- A configurable daily-time goal (the current "Above your goal" copy).
- Calendar-week (Mon–Sun) framing or custom date ranges for the activity chart — the chart
  is a rolling trailing-7-day window.

## Open questions

- None.