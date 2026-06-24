# Requirements: Instructor Analytics

> Design in [`spec.md`](./spec.md) · plan in [`plan.md`](./plan.md) · checks in [`validation.md`](./validation.md)

## Status: planned

Date: 2026-06-19 · Author: Volodymyr Pelykh · Stakeholders: instructor portal owner

## Problem

Two analytics entry points exist in the instructor portal, but neither works:

1. **Global analytics** — the sidebar links to `/instructor/analytics`
   (`app/_components/Dashboard/Sidebar/components/Navigation/index.tsx:63`). The page that
   currently sits there (`app/instructor/analytics/page.tsx`, staged) is a raw v0/shadcn paste: it
   imports from a non-existent alias (`@/components/ui/*` — the project alias is
   `@/app/_components/_shared/ui/*`), exports a named `AnalyticsOverview` instead of a route
   `default`, is one monolithic client component against the project's decomposition conventions,
   and renders **entirely fabricated numbers** (page views, traffic sources, watch time).
2. **Per-course analytics** — every instructor course card renders a chart-icon button linking to
   `/instructor/courses/${course.id}/analytics`
   (`app/_components/Course/components/CourseCard/index.tsx:78`), but **that route does not exist**,
   so the button 404s today.

The result: a navigation dead end (404) and a page that would mislead instructors with invented
metrics. The platform has no instructor-facing analytics surface backed by its own data, even though
the data to power one (enrollments, completions, progress, quiz attempts, reviews, payments) is
already stored.

## Goal

- Instructors can open a **global analytics** page that summarises engagement across all their
  courses, populated only by real platform data.
- Instructors can open a **per-course analytics** page from any course card (no more 404), showing
  metrics scoped to that one course, including where students drop off.
- **No fabricated data anywhere.** Every number traces to a real record; metrics we cannot derive
  from stored data are not shown.
- The implementation follows the established Revenue-feature pattern (thin route → feature component
  → service → repository; RSC for range-less summaries, client tRPC queries for range-driven
  charts) so it is consistent and maintainable.

## Scope decisions (locked)

1. **Real data only — no mock:** every widget is backed by an aggregate over real tables. Rationale:
   stakeholder explicitly rejected mock data; invented metrics mislead instructors.
2. **Drop un-trackable metrics:** Page Views, Avg. Watch Time, and Traffic Sources are removed —
   there is no event-tracking / view / referrer / watch-time capture in the schema, so they could
   only ever be faked. Rationale: see decision #1.
3. **Replacement metrics (chosen by stakeholder):** the dropped slots are filled by **Active
   Learners**, **Avg. Progress %**, **Quiz Pass Rate**, and an **Enrollments-by-course** breakdown
   — all derivable from existing tables.
4. **Build both surfaces this pass:** global page (replace the scaffold) and per-course route (fix
   the 404). Rationale: stakeholder selected "Both"; shipping only one leaves a visible dead end.
5. **Production-ready, full feature:** real service + repository aggregates + RSC request helpers +
   decomposed components with colocated `types.ts`, plus tests. Rationale: stakeholder selected
   "Full feature".
6. **Mirror the Revenue range pattern:** range-less summary cards are fetched in the RSC; range-
   driven charts are client components using tRPC `useQuery({ range })` with a shared range select.
   Rationale: consistency with the existing, working Revenue feature.
7. **Reuse over duplication:** the generic stat card (value + ▲/▼ delta), the range select, and the
   "Top Performing Courses" list already exist; analytics reuses them (extracting the first two to a
   shared location) rather than re-implementing. Rationale: the scaffold duplicated all three.

## Assumptions & constraints

- Range options match Revenue: **Last 30 days / Last 6 months / Last 12 months** (default 12m).
- "Active learner" = an enrollment whose `lastAccessedAt` falls within the selected range.
- All analytics are scoped to the signed-in instructor; per-course analytics additionally require
  the instructor to **own** the course.
- Trends are bucketed by **month**; aggregates run against Postgres (`learnix_test` for integration
  tests).
- Quiz pass rate is computed from `QuizAttempt.isCorrect` over the instructor's (or course's)
  quizzes; if there are no attempts the metric reads as empty (not zero-as-success).
- No new third-party analytics service is introduced.

## Functional requirements

### Global analytics (`/instructor/analytics`)

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR1 | Route | `/instructor/analytics` renders for an authenticated `INSTRUCTOR`; non-instructors are redirected (consistent with the dashboard guard). The page exports a route `default` and uses only project-valid imports. |
| FR2 | Summary cards | Four cards show **Total Enrollments**, **Active Learners**, **Avg. Progress %**, and **Quiz Pass Rate**, aggregated across all the instructor's courses, each with a ▲/▼ delta vs. the previous comparable period. |
| FR3 | Enrollment trend | An area chart shows enrollments per month (with completions overlaid) over the selected range. Changing the range refetches and updates the chart without a full page reload. |
| FR4 | Completion trend | A line chart shows average completion rate per month over the selected range. |
| FR5 | Enrollments by course | A pie/donut chart shows the distribution of enrollments across the instructor's courses for the selected range, with a legend and per-slice percentages. |
| FR6 | Top courses | The existing "Top Performing Courses" widget is reused, showing the instructor's real top courses by enrollment/engagement. |
| FR7 | Empty state | An instructor with no courses / no enrollments sees a clear empty state, not broken charts or `NaN`/divide-by-zero values. |

### Per-course analytics (`/instructor/courses/[courseId]/analytics`)

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR8 | Route + ownership | The route renders only when the signed-in instructor **owns** `courseId`; otherwise it is not found / forbidden. The course card button reaches this page (no 404). |
| FR9 | Header | The page shows the course title and a way back to the courses list. |
| FR10 | Summary cards | Cards show that course's **Enrollments**, **Active Learners**, **Avg. Progress %**, and **Quiz Pass Rate**, each with a delta vs. the previous period. |
| FR11 | Enrollment trend | An area/line chart shows that course's enrollments (and completions) per month over the selected range. |
| FR12 | Lesson completion funnel | A per-lesson breakdown (in lesson order) shows how many enrolled students completed each lesson, surfacing drop-off points, derived from `LessonProgress`. |
| FR13 | Quiz stats | The course's quiz pass rate / attempt stats are shown from `QuizAttempt`. |
| FR14 | Empty state | A course with no enrollments shows a clear empty state rather than broken visuals. |

### Wiring

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR15 | URL constant | The per-course analytics path is added to `INSTRUCTOR_URLS` and the course card links via that constant instead of a hardcoded string. |

## Non-functional requirements

| Aspect | Requirement |
|--------|-------------|
| Security / authz | All analytics queries run under `instructorProcedure`; per-course queries enforce course ownership server-side. An instructor can never read another instructor's data by guessing IDs. |
| Performance | Aggregates use set-based SQL (`groupBy` / `$queryRaw`), not per-record loops; no N+1 over courses or lessons. Range-less summaries are fetched once in the RSC. |
| Reliability | Empty/zero datasets produce defined results (empty state, `0`, or "—"), never `NaN`, `Infinity`, or thrown errors. |
| Accessibility / UX | Charts have loading states (mirroring Revenue's `isLoading` props); legends and deltas are readable; the page is keyboard-navigable. |
| Maintainability | Every component folder has a colocated `types.ts`; no inline prop types; no nested ternaries in JSX; shared widgets extracted rather than duplicated. |

## Success metrics

- The per-course analytics button reaches a working page (0 → working; 404 eliminated).
- The global analytics page renders with 100% real-data-backed widgets (0 fabricated metrics).
- Analytics service aggregates are covered by integration tests against `learnix_test`.

## Out of scope (deferred)

- Page views, traffic/referrer sources, and watch-time metrics (require an event-tracking pipeline
  not present in the schema).
- Real-time / streaming analytics; CSV/PDF export of analytics.
- Student-facing analytics and admin/platform-wide analytics.
- Date-range granularity finer than monthly (daily/weekly buckets) and custom date pickers.
- Cohort / retention analysis and revenue analytics (revenue already has its own page).

## Open questions

- None blocking. (Delta comparison window for non-12m ranges will be defined precisely in `spec.md`,
  but the rule "compare to the immediately preceding equal-length period" is assumed.)