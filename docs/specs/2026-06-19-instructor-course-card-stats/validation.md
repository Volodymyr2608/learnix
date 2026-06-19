# Validation: Instructor Course Card — Real Students/Rating/Revenue

> Requirements in [`requirements.md`](./requirements.md) · design in [`spec.md`](./spec.md) · plan in [`plan.md`](./plan.md)

## Automated checks

- `pnpm typecheck` — clean (the `OwnCourseRow` / `Paginated<T>` / `OwnCourseRepoRow`
  changes type-check end to end; the failure intentionally introduced in plan Task 1 is
  resolved by Task 4).
- `pnpm check` — Biome lint + format clean (notably the new `formatUsd` import is in its
  sorted position in `CourseCard`).
- `pnpm test:unit` and `pnpm test:integration` — green.
- `pnpm build` — production build succeeds.

### Integration tests (`*.integration.test.ts` — `learnix_test`)

Seed via the existing test factories (`test/factories.ts`) plus inline
`testDb.courseReview.create` / `testDb.payment.create`, mirroring the existing
`payment.repository.integration.test.ts` and `course.repository.integration.test.ts`.

- **Revenue per course** (`paymentRepository.getRevenueByCourseIds`, plan Task 2):
  - Sums `amountCents` for `status: succeeded, refundedAt: null` per course id; a course
    with two succeeded payments (3000 + 2000) resolves to `5000`.
  - A course whose only payment is refunded (`refundedAt` set) is **absent** from the
    map (caller defaults to `0`).
  - A course id with no qualifying payments is **absent** from the map.
  - An empty id list returns an empty `Map` (and issues no query).
- **Student count** (`courseRepository.searchOwnCourses`, plan Task 3): a course with
  one `active`, one `completed`, and one `cancelled` enrollment returns `students: 2`
  (cancelled excluded; completed still counted). The pre-existing `searchOwnCourses`
  tests (pagination, status/category/q filters, "sorts by most students") continue to
  pass unchanged.
- **Rating + revenue merge** (`courseService.searchOwnCourses`, plan Task 4): for an
  instructor with one course holding two reviews (5, 3) and one succeeded `4000` payment
  plus a second course with neither, the returned rows are
  `{ title: "Rated", rating: 4, revenueCents: 4000 }` and
  `{ title: "Unrated", rating: null, revenueCents: 0 }`. Confirms the `?? null` / `?? 0`
  defaults and that the average is the raw mean (rounding happens at display).
  - The existing `searchOwnCourses` service test ("delegates … scoped to the
    instructor") still passes, proving ownership scoping is preserved through the new
    merge.

> No unit test for `CourseCard`: this codebase has no render tests for any display card
> (`TopCourseRow`, `RecentActivity`'s `ActivityRow`, etc.). The card's correctness is
> covered by the type chain (`pnpm typecheck`) plus manual scenario 1.

## Traceability (every requirement is covered)

| Requirement | Covered by |
|-------------|-----------|
| FR1 (Students = active + completed) | `searchOwnCourses` integration test (student count, cancelled excluded); manual scenario 1 |
| FR2 (Rating to one decimal, `—` if none) | `courseService.searchOwnCourses` integration test (`rating: 4` / `rating: null`); `CourseCard` renders `toFixed(1)` / `"—"`; manual scenario 1 |
| FR3 (Revenue = lifetime gross, formatted) | `getRevenueByCourseIds` integration (sum, refund exclusion) + `courseService.searchOwnCourses` integration (`revenueCents: 4000`); `CourseCard` renders `formatUsd`; manual scenario 1 |
| FR4 (zero/`—`/`$0` defaults, no crash) | `courseService.searchOwnCourses` integration ("Unrated" → `rating: null, revenueCents: 0`); `getRevenueByCourseIds` integration (absent course); manual scenario 2 (draft) |
| FR5 (only own data) | existing `courseService.searchOwnCourses` "scoped to the instructor" test (unchanged); `instructorProcedure` session id; manual scenario 3 (IDOR) |
| FR6 (accurate across filters/sort, bounded queries) | `searchOwnCourses` integration filter/sort tests (still green); spec data-flow (stats computed over whatever page the existing filters returned); manual scenario 1 |

## Manual test scenarios

Prereqs:
```bash
docker-compose up -d        # local Postgres on 5433
pnpm dev                    # dev server
# Seed (Prisma Studio `pnpm db:studio` or existing seed scripts) an instructor A with:
#   - ≥1 PUBLISHED course that has active+completed enrollments, ≥2 reviews, and ≥1
#     succeeded (non-refunded) payment
#   - ≥1 brand-new DRAFT course with no enrollments / reviews / payments
# Have a SECOND instructor B with their own published course + activity.
```

1. **Real stats on a course with activity:** Sign in as instructor A → open
   `/instructor/courses`. The card for the active published course shows: its real
   student count (active + completed enrollments; a student who finished the course is
   still counted), a one-decimal rating (e.g. `4.0`), and its lifetime revenue formatted
   like `$4,000`. No `"-"` placeholder appears on any card.
2. **Brand-new draft — zeroed state:** On the same page, the draft course's card shows
   `0` students, `—` rating, and `$0` revenue — no crash, no leftover `"-"`.
3. **Ownership boundary (IDOR):** While signed in as instructor A, confirm no card ever
   shows instructor B's courses or numbers; sign in as B and confirm the reverse. Each
   instructor sees only their own courses' figures.
4. **Filters/sort preserve correct stats:** Apply the page's status filter (e.g.
   "Published"), a category filter, a search query, and the "Most students" sort in turn.
   Each visible card still shows the correct real numbers for that course (the stats
   track whatever course is rendered, regardless of filter/sort).

## Edge cases & regression

- **Cancelled enrollments:** excluded from a card's student count — covered by the
  `searchOwnCourses` student-count integration test.
- **Completed enrollments:** still counted — same test (consistent with the dashboard
  Top Performing Courses fix in `2026-06-16-instructor-dashboard-top-courses-activity`).
- **Refunded payment:** excluded from a card's revenue — covered by the
  `getRevenueByCourseIds` integration test.
- **No reviews → `—`, not `0.0`:** the DTO carries `rating: null` and the card renders
  `"—"`; verified by the "Unrated" merge assertion and manual scenario 2.
- **Empty page (no-match filter):** `ids === []`, both helpers return an empty `Map`
  without a DB query, and the merge over the empty `data` array yields `[]` — no extra
  queries, no crash (spec "Empty-page handling").
- **`EMPTY` fallback in the RSC action:** `searchOwnCourses` action's `EMPTY`
  (`data: []`) still satisfies the widened `PaginatedOwnCourses` type — verified by
  `pnpm typecheck`.
- **Regression — sort/pagination unchanged:** the pre-existing `searchOwnCourses`
  integration tests (pagination math, status/category/q filters, "sorts by most
  students") remain green after the `select` change.

## Definition of done

- [ ] All automated checks green; new repo method and the service merge covered by
      integration tests.
- [ ] Every FR (FR1–FR6) in `requirements.md` traces to a passing check above.
- [ ] All four manual scenarios pass.
- [ ] Risks in `spec.md` (single-caller shape change, refund double-count, latency) are
      mitigated or verified.
- [ ] Docs updated where warranted — `CLAUDE.md` does not currently describe the
      `/instructor/courses` card stats, so no CLAUDE.md change is required; note this
      feature in the spec folder only.