# Validation: Instructor Reviews Dashboard (Read-Only, Real Data)

> Requirements in [`requirements.md`](./requirements.md) · design in [`spec.md`](./spec.md) · plan in [`plan.md`](./plan.md)

## Automated checks

- `pnpm typecheck` — clean.
- `pnpm check` — Biome lint + format clean.
- `pnpm test:unit` and `pnpm test:integration` — green.

### Unit tests (`*.test.ts` — no DB, deps mocked)

- `InstructorService.getReviewStats` (`server/services/instructor/instructor.service.test.ts`):
  given a mocked `perStar` map, builds `distribution` ordered 5→1 with `percent = count/total*100`,
  rounds `fiveStarPercent` (e.g. 2 of 4 → `50`), passes `average`/`lowRatingCount` through, and with
  `total === 0` returns `average: null`, `fiveStarPercent: 0`, and all buckets zeroed.
- `InstructorService.getReviews`: wraps repository `{ rows, total }` into pagination metadata —
  `total: 23, page 2, perPage 10 → lastPage 3`; `total 0 → lastPage 1`.
- `parseReviewsSearchParams` (`app/_components/Instructor/Reviews/searchParams.test.ts`): empty →
  `{ courseId: "all", rating: "all", page: 1 }`; out-of-range `rating`/`page` fall back to
  `all`/`1`; valid values preserved.
- `toStatsInput` / `toReviewsInput`: `toStatsInput` emits `courseId` only and drops `"all"`;
  `toReviewsInput` maps `rating` string → number, drops `"all"` for both `courseId` and `rating`,
  always carries `page`.

### Integration tests (`*.integration.test.ts` — `learnix_test`)

- `getInstructorReviewStats` (`server/repositories/courseReview.repository.integration.test.ts`):
  aggregates `total`, `average` (rating-weighted), `fiveStarCount`, `lowRatingCount` (ratings 1+2),
  and `perStar`; scopes to a single `courseId` when given; counts only the instructor's own
  non-deleted courses/reviews — another instructor's reviews and soft-deleted rows are excluded.
- `findInstructorReviews`: newest-first ordering; `rating` filter; pagination (`skip/take`) and a
  `total` independent of the page; each row carries `studentName`, `studentImage`, `courseTitle`,
  `comment`, `tags`.
- `getInstructorReviewCourseOptions`: one entry per owned course that has ≥1 review; a course with
  no reviews is excluded; duplicate reviews on the same course yield a single option.
- **Dashboard parity:** `getInstructorReviewStats(instructorId).average` equals
  `getInstructorRatingStats(instructorId).average` for the same seeded data (all-courses view).

## Traceability (every requirement is covered)

| Requirement | Covered by |
|-------------|-----------|
| FR1 Average rating | `getInstructorReviewStats` IT · `getReviewStats` UT · Manual #1 |
| FR2 Total reviews | `getInstructorReviewStats` IT · `getReviewStats` UT · Manual #1 |
| FR3 5-star share | `getReviewStats` UT (rounding) · Manual #1 |
| FR4 Low ratings (≤2) | `getInstructorReviewStats` IT · `getReviewStats` UT · Manual #1 |
| FR5 Distribution bars | `getReviewStats` UT (order 5→1, percent) · Manual #1 |
| FR6 Summary block | Manual #1 |
| FR7 Course filter rescopes stats+list | `getInstructorReviewStats`/`findInstructorReviews` IT (courseId) · `toStatsInput`/`toReviewsInput` UT · Manual #2 |
| FR8 Rating tabs filter list only | `findInstructorReviews` IT (rating) · `toStatsInput` UT (no rating) · Manual #3 |
| FR9 Combined filters | `findInstructorReviews` IT · Manual #4 |
| FR10 Review card fields | `findInstructorReviews` IT (row fields) · Manual #1 |
| FR11 Tag badges | `findInstructorReviews` IT (tags) · Manual #5 |
| FR12 Ordering + pagination | `findInstructorReviews` IT · `getReviews` UT · Manual #6 |
| FR13 Empty-filter state | helper fallback · Manual #7 |
| FR14 No-reviews state | `getReviewStats` UT (null/zero) · helper fallback · Manual #8 |
| FR15 Page header | Manual #9 |

## Manual test scenarios

Prereqs:
```bash
docker-compose up -d        # local Postgres on 5433
pnpm dev                    # start the app
# Sign in as an instructor who owns ≥2 published courses with several reviews across ratings,
# including at least one 1–2★ review and at least one review carrying tags.
# Also have a second instructor account and a brand-new instructor with zero reviews.
```

1. **Stats are real:** open `/instructor/reviews`. → The four cards show this instructor's real
   Average Rating (one decimal), Total Reviews, 5-Star %, and Low Ratings (≤2★); the summary block
   shows the same average with a 5→1 distribution whose counts sum to Total Reviews. Cross-check
   against Prisma Studio (`pnpm db:studio`) and the instructor dashboard's rating stat — the
   all-courses average matches.
2. **Course filter rescopes everything:** pick a single course in the dropdown. → Stats,
   distribution, **and** the list all narrow to that course; the URL gains `?courseId=…`.
3. **Rating tab filters list only:** click "5 star". → The list shows only 5★ reviews, but the
   distribution bars and the four stat cards are unchanged; URL gains `&rating=5`.
4. **Combined:** with a course selected and "4 star" active → only that course's 4★ reviews show.
5. **Tags render:** a review created with tags shows them as badges; a review with no tags shows no
   badge row; no "title" line appears (only the comment body).
6. **Pagination:** with >10 in-scope reviews, Next/Previous page through them newest-first; the
   stats do not change between pages; changing a filter resets to page 1.
7. **Empty filter:** choose a course + rating combination with no matching reviews → "No reviews
   match your filters." card shows; stats reflect the course scope (not the empty list).
8. **No-reviews instructor:** sign in as the brand-new instructor → cards read `0.0 / 0 / 0% / 0`,
   the distribution is empty, the list shows the empty state, and the course dropdown lists only
   "All courses". No crash, and none of the mock names (Sarah Johnson, Mike Chen, Emma Wilson,
   James Lee, Olivia Brown) appear anywhere in the page source.
9. **Header fixed:** the page shows a single "Reviews" heading with the reviews description — no
   "Revenue" text and no duplicate `<h1>`.

## Edge cases & regression

- **IDOR:** manually call `instructor.getReviews` / `getReviewStats` with another instructor's
  `courseId` → empty result, never that instructor's data (the ownership `where` filters it out).
- **Soft-deleted reviews/courses** are excluded from every count, the list, and the dropdown.
- **Average rounding** never makes the five distribution counts disagree with Total Reviews (counts
  come straight from `groupBy`).
- **Transient fetch failure** (simulate by throwing in a request helper) → page renders zeroed
  stats + empty list, no crash.
- **Regression:** the student-facing `review.create` / `review.getEligibility` flow and the
  instructor dashboard rating stat are untouched and still pass their existing tests.

## Definition of done

- [ ] All automated checks green; new logic covered by unit (service, searchParams) + integration
      (three repository methods + dashboard parity) tests.
- [ ] Every FR in `requirements.md` traces to a passing check above.
- [ ] All manual scenarios pass.
- [ ] Risks in `spec.md` (dashboard divergence, rounding, dangling import) are mitigated.
- [ ] `CLAUDE.md` "Routers" / instructor portal notes mention the new `instructor.getReviews*`
      queries if a reader would otherwise miss them; no ADR needed (no architectural decision).