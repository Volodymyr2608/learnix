# Validation: Instructor Dashboard — Top Performing Courses & Recent Activity

> Requirements in [`requirements.md`](./requirements.md) · design in [`spec.md`](./spec.md) · plan in [`plan.md`](./plan.md)

## Automated checks

- `pnpm typecheck` — clean.
- `pnpm check` — Biome lint + format clean.
- `pnpm test:unit` and `pnpm test:integration` — green.
- `pnpm build` — production build succeeds.

### Unit tests (`*.test.ts` — no DB, external deps mocked)

- `lib/utils/date/relativeTime.ts` (`relativeTimeLabel`): a timestamp 10 minutes in the past renders a string containing `"ago"` (suffix applied).
- `server/services/instructor/instructor.service.ts` (`getTopPerformingCourses`, repos mocked):
  - Ranks the courses returned by `getRevenueGroupedByCourse`, attaches `students` from the cards map and `rating` from the ratings map, and **drops** any ranked course missing from the cards map (soft-deleted / not owned). A course with no rating entry resolves to `rating: null`.
  - Returns `[]` when `getRevenueGroupedByCourse` returns no rows, and does **not** call `getCourseCardsByIds` in that case.
  - Breaks equal-revenue ties deterministically by `students` desc, then `title` asc (e.g. `[a:Zeta/5, b:Alpha/5, c:Beta/9]` all at 1000¢ → order `c, b, a`).
- `server/services/instructor/instructor.service.ts` (`getRecentActivity`, repos mocked):
  - Merges enrollment rows (`occurredAt = enrolledAt`) and review rows (`occurredAt = createdAt`), sorts newest-first across both types, and caps the result at `limit` (e.g. `limit=2` over 2 enrollments + 1 review → the 2 newest by timestamp, correctly typed `enrollment`/`review`).
  - Returns `[]` when both repositories return no rows.

### Integration tests (`*.integration.test.ts` — `learnix_test`)

Seed via the existing test factories (`test/factories.ts`) plus inline `testDb.courseReview.create`, mirroring `payment.repository.integration.test.ts`.

- **Course cards** (`courseRepository.getCourseCardsByIds`): returns `{ title, students }` keyed by course id where `students` counts only **active** enrollments (a `cancelled` enrollment is excluded); a course owned by a *different* instructor is omitted from the map; an empty id list returns an empty map.
- **Average rating** (`courseReviewRepository.getAvgRatingByCourseIds`): averages only non-deleted reviews per course (e.g. ratings `5, 3` with a soft-deleted `1` → `4`); a course with no reviews is absent from the map; an empty id list returns an empty map.
- **Recent enrollments** (`enrollmentRepository.findRecentByInstructor`): returns active enrollments newest-first by `enrolledAt`, each flattened to `{ id, studentName, courseTitle, enrolledAt }`; enrollments on another instructor's course are excluded.
- **Recent reviews** (`courseReviewRepository.findRecentByInstructor`): returns non-deleted reviews newest-first by `createdAt`, each flattened to `{ id, studentName, courseTitle, rating, createdAt }`, scoped to the instructor's courses.

## Traceability (every requirement is covered)

| Requirement | Covered by |
|-------------|-----------|
| FR1 (top 3 ordered by revenue) | `getTopPerformingCourses` unit test (ranking); `getCourseCardsByIds` integration; manual scenario 1 |
| FR2 (row shows title/students/rating/revenue) | `getTopPerformingCourses` unit test (assembly); `TopPerformingCourses` component (renders `formatUsd`, rating); manual scenario 1 |
| FR3 (only owner's courses) | `getCourseCardsByIds` integration (foreign course omitted); `instructorProcedure` (session id); manual scenario 4 (IDOR) |
| FR4 (deterministic tie-break) | `getTopPerformingCourses` unit test (tie-break order) |
| FR5 (empty state / no rating → `—`) | `getTopPerformingCourses` unit test (`[]` + `rating: null`); `TopPerformingCourses` empty-state + `—` rendering; manual scenario 3 |
| FR6 (View All link) | `TopPerformingCourses` component uses `INSTRUCTOR_URLS.courses`; manual scenario 1 |
| FR7 (≤5 merged newest-first) | `getRecentActivity` unit test (merge/sort/cap); manual scenario 2 |
| FR8 (wording from real records) | `getRecentActivity` unit test (typed events); `RecentActivity` `activityText` helper; manual scenario 2 |
| FR9 (relative timestamp) | `relativeTimeLabel` unit test; `RecentActivity` renders it; manual scenario 2 |
| FR10 (icon by type, no "question") | `RecentActivity` `ActivityIcon` (only enrollment/review); manual scenario 2 |
| FR11 (only owner's activity) | `findRecentByInstructor` integration (both repos exclude foreign courses); `instructorProcedure`; manual scenario 4 |
| FR12 (activity empty state) | `getRecentActivity` unit test (`[]`); `RecentActivity` empty-state rendering; manual scenario 3 |

## Manual test scenarios

Prereqs:
```bash
docker-compose up -d        # local Postgres on 5433
pnpm dev                    # dev server
# Seed an instructor with: ≥3 published courses, succeeded payments across courses,
# active enrollments, and a few course reviews (use Prisma Studio `pnpm db:studio`
# or the existing seed scripts). Have a SECOND instructor with their own data.
```

1. **Top Performing — real ranking:** Sign in as the seeded instructor → open `/instructor`. The "Top Performing Courses" card lists that instructor's top 3 courses ordered by gross revenue (highest first). Each row shows the real title, real active-student count, the real average rating (one decimal, or `—` if a course has no reviews), and revenue formatted like `$4,560`. "View All" navigates to `/instructor/courses`.
2. **Recent Activity — real feed:** On the same dashboard, "Recent Activity" shows up to 5 entries merged from recent enrollments and reviews, newest first. Enrollment rows read "<student> enrolled in <course>" with a Users icon; review rows read "<student> left a <n>-star review on <course>" with a Star icon. Each shows a relative time ("2 hours ago"). No "question"/Q&A row appears.
3. **Brand-new instructor — empty states:** Sign in as an instructor with no courses/sales/enrollments/reviews → `/instructor`. "Top Performing Courses" shows "No course sales yet…" and "Recent Activity" shows "No recent activity yet…". No fabricated names or numbers appear.
4. **Ownership boundary (IDOR):** While signed in as instructor A, confirm neither card ever shows instructor B's courses, students, or reviews — the second seeded instructor's data must be entirely absent from A's dashboard.

## Edge cases & regression

- **Resilience:** if `getTopPerformingCourses` throws, its RSC helper returns `[]` and that card shows its empty state while "Recent Activity", the stat cards, and the revenue chart still render (and vice-versa) — verify by temporarily forcing one query to throw, or trust the helper-level try/catch covered by the existing `getDashboardStats` pattern.
- **Soft-deleted course among top earners** (spec risk): a course deleted after earning revenue is dropped by `getCourseCardsByIds` (`deletedAt: null` filter) and never renders — covered by the cards integration test (foreign/missing course omission) and the service "drops missing courses" unit test.
- **Soft-deleted course activity** (spec risk): reviews/enrollments on a soft-deleted course are excluded by the `course.is { deletedAt: null }` filter in both `findRecentByInstructor` queries.
- **Date serialization** (spec risk): `occurredAt` survives the tRPC boundary as a real `Date` (superjson) and formats correctly client-side — confirmed visually in manual scenario 2 (relative time renders, no "Invalid Date").
- **Cancelled enrollments:** excluded from per-course student counts (cards integration test) and from the activity feed (recent-enrollments query filters `status: active`).
- **Regression:** the stat cards and the revenue chart are unchanged and still render (manual scenarios 1–3 view the full page).

## Definition of done

- [ ] All automated checks green; new repo methods covered by integration tests and both service methods by unit tests.
- [ ] Every FR (FR1–FR12) in `requirements.md` traces to a passing check above.
- [ ] All four manual scenarios pass.
- [ ] Risks in `spec.md` (groupBy tie order, soft-deleted course leakage in either widget, Date serialization) are mitigated and verified.
- [ ] Docs updated where warranted (the dashboard widgets are no longer mocked — note in CLAUDE.md if it references them as placeholders).