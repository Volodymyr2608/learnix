# Spec: Instructor Analytics

> Requirements in [`requirements.md`](./requirements.md) · plan in [`plan.md`](./plan.md) · checks in [`validation.md`](./validation.md)

## Approach (overview)

Build two thin routes (`/instructor/analytics` and `/instructor/courses/[courseId]/analytics`) that
each render a feature component, following the **Revenue feature** end-to-end pattern exactly:
router → service → repository on the server; RSC for the range-less summary cards and client
components with tRPC `useQuery({ range })` for the range-driven charts. All metrics are computed from
existing tables (`Enrollment`, `CourseProgress`, `LessonProgress`, `QuizAttempt`, `Quiz`, `Lesson`,
`Course`) via set-based SQL — **no new schema, no mock data**. We reuse the existing time-window and
delta primitives (`resolveRange`, `computeDelta`, `StatDelta`) and the existing
`TopPerformingCourses` widget, and **extract** the already-existing `StatCard`, `DeltaBadge`, and the
range select into a shared location so Revenue and Analytics share one implementation.

The one trade-off: we put analytics aggregates in a dedicated `AnalyticsRepository` rather than
spreading them across the enrollment/lessonProgress/quiz repositories. These queries are
analytics-shaped (month buckets, funnels, dual current-vs-previous windows) and don't belong to any
single CRUD concern — mirroring how revenue time-series lives inside `paymentRepository`. Rejected
alternative: scattering the aggregates across four repos, which would obscure the feature and
duplicate the date-bucketing logic.

## Architectural decisions referenced

- **Three-layer server pattern** (CLAUDE.md: routers → services → repositories) — analytics gets its
  own router, service (+ `.errors.ts`), and repository.
- **Procedure-level role gating** (`server/api/trpc.ts`) — every procedure is `instructorProcedure`;
  per-course procedures additionally enforce ownership in the service.
- **Revenue feature pattern** (`app/_components/Instructor/Revenue`, `server/services/payments`) —
  the structural template for files, range handling, and chart `isLoading` props.
- **Component conventions** (CLAUDE.md) — colocated `types.ts`, no inline prop types, no nested
  ternaries in JSX, extract repeated layout, flatten loading states.

## Data model

**No schema changes.** All aggregates read existing models. Relevant fields:

- `Enrollment` — `courseId`, `status`, `progress` (0–100), `enrolledAt`, `completedAt`,
  `lastAccessedAt`. (`prisma/schema/enrollment.prisma`)
- `CourseProgress` — `courseId`, `progress`, `completedLessons`, `totalLessons`.
- `LessonProgress` — `lessonId`, `studentId`, `isCompleted`, `completedAt`. (`prisma/schema/lesson.prisma`)
- `QuizAttempt` — `quizId`, `isCorrect`, `createdAt`; `Quiz` → lesson → section → course for scoping.
- `Lesson` / `Section` — ordering for the funnel; `Course.instructorId` for ownership.

No migration, no backfill.

## API & contracts

New router `analytics` (registered in `server/api/root.ts`). All `instructorProcedure`. Range input
reuses a shared `statsRangeInput` (`{ range: "30d" | "6m" | "12m" }`).

| Procedure | Type / auth | Input → Output | Notes |
|-----------|-------------|----------------|-------|
| `analytics.getOverviewSummary` | instructor | `void` → `AnalyticsSummary` | Aggregated across all the instructor's courses; range-less (current vs previous month deltas, like the dashboard). RSC-fetched. |
| `analytics.getEnrollmentTrend` | instructor | `{ range }` → `EnrollmentTrendPoint[]` | Enrollments + completions per bucket. |
| `analytics.getCompletionTrend` | instructor | `{ range }` → `CompletionTrendPoint[]` | Avg completion/progress % per bucket. |
| `analytics.getEnrollmentsByCourse` | instructor | `{ range }` → `EnrollmentsByCourseItem[]` | Distribution across the instructor's courses. |
| `analytics.getCourseSummary` | instructor + **owns courseId** | `{ courseId }` → `CourseAnalyticsSummary` | Same shape as overview, scoped to one course. |
| `analytics.getCourseEnrollmentTrend` | instructor + owns | `{ courseId, range }` → `EnrollmentTrendPoint[]` | One course's enrollment/completion trend. |
| `analytics.getLessonFunnel` | instructor + owns | `{ courseId }` → `LessonFunnelItem[]` | Per-lesson completion in lesson order. |
| `analytics.getCourseQuizStats` | instructor + owns | `{ courseId }` → `CourseQuizStats` | Pass rate / attempts for the course. |

DTOs (`server/entities/analytics/analytics.ts`):

```ts
type Metric = { value: number; delta: StatDelta };          // reuses StatDelta from lib/stats/statDelta

type AnalyticsSummary = {
  enrollments: Metric;
  activeLearners: Metric;                                    // lastAccessedAt within current month
  avgProgress: Metric;                                       // 0..100
  quizPassRate: { percent: number | null; attempts: number };// null when attempts === 0
};
type CourseAnalyticsSummary = AnalyticsSummary;

type EnrollmentTrendPoint = { period: string; enrollments: number; completions: number };
type CompletionTrendPoint = { period: string; rate: number };
type EnrollmentsByCourseItem = { courseId: string; title: string; enrollments: number };
type LessonFunnelItem = { lessonId: string; title: string; order: number; enrolled: number; completed: number };
type CourseQuizStats = { passRate: number | null; attempts: number; correct: number };
```

Shared range primitive (`server/entities/stats/range.ts`, extracted from `payment/revenue.ts`):
`statsRangeSchema` (enum `30d|6m|12m`), `StatsRange`, `statsRangeInput`. `payment/revenue.ts`
re-exports these as `RevenueRange` / `revenueRangeInput` so existing payment code is untouched.

## Component / data flow

```
Global page (RSC)                          Per-course page (RSC)
  guard: session.role === INSTRUCTOR         guard: instructor + service.assertOwnsCourse
  getAnalyticsSummary()  ── tRPC ─┐          getCourseAnalyticsSummary(courseId) ─┐
        │                          └─► analytics.service ─► AnalyticsRepository    │
  <AnalyticsOverview>                     │  resolveRange()  date_trunc / groupBy  │
   ├ <AnalyticsSummaryCards> (RSC data)   │  computeDelta(current, previous)       │
   ├ <AnalyticsCharts> ("use client")     ▼                                        ▼
   │   range = useState("12m")        Postgres aggregates                    <CourseAnalytics>
   │   useQuery({range}) ×3  ───────────────────────────────────────────►    ├ <CourseAnalyticsHeader>
   │   ├ <EnrollmentTrendChart>  (area)                                       ├ <CourseAnalyticsSummaryCards>
   │   ├ <CompletionTrendChart>  (line)                                       ├ <CourseAnalyticsCharts> (client, range)
   │   └ <EnrollmentsByCourseChart> (pie)                                     └ <LessonCompletionFunnel> (RSC data)
   └ <TopPerformingCourses> (reused, RSC data)
```

Ownership failure → service throws `AnalyticsForbiddenError` → `handleServiceError` maps to a tRPC
`FORBIDDEN`; the per-course route treats a missing/forbidden course as `notFound()`.

Empty data: `computeDelta` already returns `{kind:"none"}` for 0/0; rate metrics return `null` (UI
shows "—"); charts receive `[]` and render their empty/loading state. No `NaN`/divide-by-zero.

## File list

**New — routes**
- `app/instructor/analytics/page.tsx` — *replaces the scaffold*; RSC instructor guard, renders `<AnalyticsOverview>`.
- `app/instructor/courses/[courseId]/analytics/page.tsx` — RSC; resolves `courseId`, renders `<CourseAnalytics courseId>`, `notFound()` on non-ownership.

**New — entities**
- `server/entities/analytics/analytics.ts` — the DTOs above.
- `server/entities/stats/range.ts` — shared `statsRangeSchema` / `StatsRange` / `statsRangeInput`.

**New — server layer**
- `server/repositories/analytics.repository.ts` — set-based aggregates: enrollments/completions by bucket, active-learner counts (current+previous), avg progress (current+previous), enrollments grouped by course, lesson completion funnel, quiz pass rate. Course-scoping via `courseId IN (...)`.
- `server/services/analytics/analytics.service.ts` — resolves the instructor's course IDs, enforces ownership, calls `resolveRange`/`computeDelta`, shapes DTOs.
- `server/services/analytics/analytics.errors.ts` — `AnalyticsForbiddenError`, `CourseNotFoundError`.
- `server/api/routers/analytics.ts` — the 8 procedures above, `handleServiceError` wrapped.

**New — RSC request helpers** (mirror `getDashboardStats`, with safe empty fallbacks)
- `lib/requests/instructor/getAnalyticsSummary.ts`
- `lib/requests/instructor/getCourseAnalyticsSummary.ts`

**New — shared instructor components** (extracted; `types.ts` each)
- `app/_components/Instructor/_shared/StatCard/` — moved from `Revenue/.../RevenueSummaryCards/components/StatCard`.
- `app/_components/Instructor/_shared/DeltaBadge/` — moved from the same place.
- `app/_components/Instructor/_shared/RangeSelect/` — generic select (`value`, `onChange`, `options`), generalised from `RevenueRangeSelect`.

**New — global feature** (`app/_components/Instructor/Analytics/`, `types.ts` each)
- `index.tsx` — RSC composition.
- `components/AnalyticsSummaryCards/` — 4 cards via shared `StatCard` + `DeltaBadge`.
- `components/AnalyticsCharts/` — `"use client"`; owns `range` state + the three `useQuery` calls.
- `components/EnrollmentTrendChart/` — area chart (enrollments + completions).
- `components/CompletionTrendChart/` — line chart.
- `components/EnrollmentsByCourseChart/` — pie/donut + legend with percentages.

**New — per-course feature** (`app/_components/Instructor/CourseAnalytics/`, `types.ts` each)
- `index.tsx` — RSC composition.
- `components/CourseAnalyticsHeader/` — title + back link.
- `components/CourseAnalyticsSummaryCards/` — 4 cards (shared primitives).
- `components/CourseAnalyticsCharts/` — `"use client"`; range state + course enrollment trend + quiz stats.
- `components/LessonCompletionFunnel/` — ordered per-lesson completion bars (drop-off).

**Modified**
- `server/api/root.ts` — register `analytics: analyticsRouter`.
- `lib/constants/urls/instructorUrls.ts` — add `courseAnalytics: (id) => \`${MAIN_URL}/courses/${id}/analytics\``.
- `app/_components/Course/components/CourseCard/index.tsx` — link via `INSTRUCTOR_URLS.courseAnalytics(course.id)` (replaces the hardcoded path at line 78).
- `server/entities/payment/revenue.ts` — re-export the shared range from `entities/stats/range.ts`.
- `lib/stats/revenueRange.ts` — retype `resolveRange` to `StatsRange` (behaviour unchanged).
- `app/_components/Instructor/Revenue/components/RevenueSummaryCards/index.tsx` & `RevenueRangeSelect` — import the shared `StatCard`/`DeltaBadge`/`RangeSelect`.

**Tests**
- `server/services/analytics/analytics.service.integration.test.ts` — aggregates + ownership against `learnix_test`.
- `server/repositories/analytics.repository.integration.test.ts` — bucketing & funnel correctness.
- unit tests for any new pure helper (e.g. funnel ordering / percentage mapping) and the generalised range options.

## Cross-cutting concerns

- **Security / authz:** all procedures `instructorProcedure`; per-course procedures call
  `service.assertOwnsCourse(instructorId, courseId)` (queries `Course.instructorId`) before any
  aggregate — prevents IDOR. The global aggregates always filter by the instructor's own course IDs.
- **Error handling:** typed domain errors in `analytics.errors.ts` → `handleServiceError` → tRPC
  codes; per-course route maps forbidden/not-found to `notFound()`.
- **Idempotency / consistency:** read-only feature; no writes, no transactions.
- **Performance:** aggregates are `date_trunc` raw SQL / Prisma `groupBy` (mirroring
  `paymentRepository.getRevenueByBucket`/`getRevenueGroupedByCourse`); no per-course or per-lesson
  loops. Range-less summary fetched once per page in the RSC. Existing indexes
  (`Enrollment @@index(courseId)`, `LessonProgress @@unique(lessonId, studentId)`) cover the scans.
- **Observability:** service methods log via the existing `logger` (as in `instructor.service`).

## Risks & mitigations

| Risk | L/I | Mitigation |
|------|-----|------------|
| Extracting StatCard/DeltaBadge/RangeSelect breaks Revenue | M / M | Move + repoint imports in the same commit; `pnpm typecheck` + Revenue page smoke check; behaviour identical. |
| Quiz scoping (attempt → course) is multi-join and easy to get wrong | M / M | Cover with an integration test asserting attempts on another instructor's course are excluded. |
| Active-learner / avg-progress deltas need a previous-period window the existing helpers don't expose | L / M | Reuse `computeDelta(current, previous)` by issuing two windowed counts (this-month vs last-month), exactly as the dashboard does. |
| `date_trunc` buckets omit empty months, leaving gaps in charts | L / L | Zero-fill the bucket series in the service against `resolveRange`, as the revenue time-series does. |

## Rollout / migration

No env vars, no DB migration, no feature flag. Ships as a normal branch merge. To undo: revert the
branch (the only externally-visible change is the now-working analytics routes and the card link).