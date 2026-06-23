# Validation: Instructor Analytics

> Requirements in [`requirements.md`](./requirements.md) · design in [`spec.md`](./spec.md) · plan in [`plan.md`](./plan.md)

## Automated checks

- `pnpm typecheck` — clean (includes the Revenue refactor in Tasks 1-2 and the new `api.analytics.*` types).
- `pnpm check` — Biome lint + format clean.
- `pnpm test:unit` — green.
- `pnpm test:integration` — green (requires `learnix_test`; see `.env.test.example`).

### Unit tests (`*.test.ts` — no DB)

- `lib/stats/fillBuckets.ts`: a 3-month range `[2026-01, 2026-03]` with one row in Feb (`enrollments: 5`)
  → `[0, 5, 0]`, and the Feb bucket's `period` is `"2026-02-01"`. Missing buckets get the `empty`
  template; present buckets keep their values.

### Integration tests (`*.integration.test.ts` — `learnix_test`)

`server/repositories/analytics.repository.integration.test.ts`:
- `getInstructorCourseIds` returns only the instructor's own (non-deleted) course ids.
- `countEnrollments` counts all enrollments for the given course ids; another instructor's course is excluded.
- `countActiveLearners` counts only enrollments with `lastAccessedAt` inside the window (1 of 2 in the test).
- `getAvgProgress` returns the rounded average progress (`80,20 → 50`); `[]` → `0` (no divide-by-zero).
- `getQuizStats` returns `{ attempts, correct }` scoped via quiz → lesson → section → course (`{2,1}`).
- `getEnrollmentTrend` buckets by `enrolledAt` and counts `completions` via non-null `completedAt`
  (totals across buckets: 2 enrollments, 1 completion).
- `getEnrollmentsByCourse` groups enrollments by course with titles (`{title:"Course A", enrollments:2}`).
- `getLessonCompletions` maps `lessonId → completed count` (`l1:2, l2:1`).

`server/services/analytics/analytics.service.integration.test.ts`:
- `getOverviewSummary` aggregates across the instructor's courses: `enrollments.value=2`,
  `avgProgress.value=75`, `avgProgress.delta={kind:"none"}`, `activeLearners.value=1`.
- `getOverviewSummary` for an instructor with no courses → all zeros, `quizPassRate.attempts=0`,
  no thrown error (FR7).
- `getCourseSummary`/`getLessonFunnel` **reject a non-owned course** (ownership guard → throws).
- `getLessonFunnel` returns lessons in course order (`["Intro","Deep dive"]`, `order [0,1]`) with
  `enrolled`/`completed` per lesson.

## Traceability (every requirement is covered)

| Requirement | Covered by |
|-------------|-----------|
| FR1 (global route renders for instructor; valid imports; default export) | Manual #1; `pnpm typecheck`/`check` |
| FR2 (4 summary cards + deltas; avgProgress delta documented as none) | `getOverviewSummary` integration test; Manual #1 |
| FR3 (enrollment area chart; range refetch) | `getEnrollmentTrend` repo + service tests; Manual #2 |
| FR4 (completion line chart) | `getCompletionTrend` derivation (service test data) ; Manual #2 |
| FR5 (enrollments-by-course pie + %) | `getEnrollmentsByCourse` test; Manual #2 |
| FR6 (reuse Top Performing Courses) | Manual #1 |
| FR7 (global empty state) | empty-summary integration test; Manual #5 |
| FR8 (per-course route + ownership; no 404) | ownership integration test; Manual #3, #6 |
| FR9 (header + back link) | Manual #3 |
| FR10 (per-course summary cards + deltas) | `getCourseSummary` test; Manual #3 |
| FR11 (per-course enrollment trend) | `getCourseEnrollmentTrend` (shares `enrollmentTrendFor`); Manual #3 |
| FR12 (lesson completion funnel) | `getLessonFunnel` test; Manual #4 |
| FR13 (quiz stats) | `getQuizStats` repo test; Quiz Pass Rate card Manual #1/#3 |
| FR14 (per-course empty state) | Manual #5 |
| FR15 (URL constant + card uses it) | `pnpm typecheck`; Manual #6 |

## Manual test scenarios

Prereqs:
```bash
docker-compose up -d          # local Postgres on 5433
pnpm dev                      # dev server
# Sign in as an INSTRUCTOR who owns at least one published course with enrollments,
# lesson progress, and a quiz attempt (seed or use existing data).
```

1. **Global page renders real data:** open `/instructor/analytics`. Expect four summary cards
   (Total Enrollments, Active Learners, Avg. Progress, Quiz Pass Rate) with real values; three show
   ▲/▼ deltas, Avg. Progress shows no delta; the Top Performing Courses list shows the instructor's
   real courses. No `NaN`, no console errors.
2. **Range switching:** change the range selector (30 days / 6 months / 12 months). The enrollment
   area chart, completion line chart, and enrollments-by-course pie all refetch and update without a
   full page reload; the pie percentages sum to ~100%.
3. **Per-course page from the card:** on `/instructor/courses`, click a course card's chart-icon
   button. Expect the per-course analytics page (title "Course Analytics", a "Back to courses"
   button, four cards, the enrollment chart, and the lesson funnel) — **no 404**.
4. **Lesson funnel drop-off:** on the per-course page, the funnel lists lessons in course order with
   `completed/enrolled (pct%)` and a progress bar per lesson; later lessons show lower completion
   than earlier ones for a partially-completed cohort.
5. **Empty states:** sign in as an instructor with no courses → global page shows zeroed cards and
   chart empty messages, not broken visuals. Open a course with no enrollments → cards read 0 / "—"
   and the funnel/chart show their empty messages.
6. **Ownership (IDOR):** while signed in as instructor A, navigate directly to
   `/instructor/courses/<a course owned by instructor B>/analytics`. Expect a 404 (not B's data).

## Edge cases & regression

- **IDOR / ownership:** per-course service methods call `assertOwnedCourse`; the request helper maps
  the thrown error to `notFound()`. Verified by the ownership integration test + Manual #6.
- **Divide-by-zero / empty:** `getAvgProgress([])`, `quizPassRate` with 0 attempts, and
  `completion rate` with 0 enrollments all return defined values (0 / "—"), never `NaN`/`Infinity`.
- **Chart gaps:** `fillBuckets` guarantees every month/day in range is present so charts have no
  holes (unit test).
- **Revenue regression (from the shared extraction):** `/instructor/revenue` still renders its
  summary cards, range select, and charts identically after `StatCard`/`DeltaBadge`/`RangeSelect`
  were moved — covered by `pnpm typecheck`/`check` (no dangling imports) + a manual smoke load of
  `/instructor/revenue`.
- **Quiz scoping:** attempts on another instructor's course are excluded from pass rate (repo test).

## Definition of done

- [ ] All automated checks green; new repository/service code covered by integration tests and the
      `fillBuckets` helper by a unit test.
- [ ] Every FR in `requirements.md` traces to a passing check above.
- [ ] All six manual scenarios pass, including the Revenue regression smoke check.
- [ ] Risks in `spec.md` are mitigated (extraction typecheck-gated; quiz scoping tested; deltas via
      `getMonthWindows`/`computeDelta`; chart gaps via `fillBuckets`).
- [ ] No fabricated/mock metrics remain anywhere in the analytics surfaces.
- [ ] Docs updated where warranted: add an "Instructor analytics" subsection to CLAUDE.md
      (Architecture) describing the `analytics` router/service/repository and the two routes; note
      the dropped metrics (page views / traffic / watch time) and why.