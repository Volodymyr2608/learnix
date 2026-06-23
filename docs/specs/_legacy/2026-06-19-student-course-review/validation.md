# Validation: Student Course Review

> Requirements in [`requirements.md`](./requirements.md) · design in [`spec.md`](./spec.md) · plan in [`plan.md`](./plan.md)

## Automated checks

- `pnpm typecheck` — clean.
- `pnpm check` — Biome lint + format clean.
- `pnpm test:unit` and `pnpm test:integration` — green.
- `pnpm build` — succeeds with the `/dashboard/courses/[courseId]/review` route present (server component compiles).

### Unit tests (`*.test.ts` — no DB, external deps mocked)

- `createReviewInput` (`server/entities/review/review.dto.test.ts`):
  - valid payload (`rating 5`, 50-char comment, `[PACE]`) parses unchanged.
  - omitting `tags` defaults to `[]`.
  - `rating` 0 and 6 rejected; non-integer `4.5` rejected.
  - comment shorter than 50 chars rejected.
  - unknown tag string (`"NOT_A_TAG"`) rejected.
- `reviewService.getEligibility` (`server/services/review/review.service.test.ts`):
  - no enrollment → `{ state: "ineligible" }`.
  - enrollment `status: active` → `{ state: "ineligible" }`.
  - completed + no existing review → `{ state: "eligible" }` with `course.totalLessons === 3` and `course.instructor === "David Kim"`.
  - completed + existing review → `{ state: "alreadyReviewed" }` exposing `review.rating === 4` and `review.tags === [PACE]`.
- `reviewService.createReview` (same file):
  - enrollment not completed → throws `ReviewError` `code: "FORBIDDEN"`, repo `create` never called.
  - existing review present → throws `ReviewError` `code: "CONFLICT"`, repo `create` never called.
  - happy path → returns `{ id: "rev_new" }` and calls `create` with exactly `{ studentId, courseId, rating, comment, tags }`.

### Integration tests (`*.integration.test.ts` — `learnix_test`)

- `CourseReviewRepository.findByStudentAndCourse` (`courseReview.repository.integration.test.ts`):
  - returns the active review for a `(studentId, courseId)` pair.
  - returns `null` when the only matching review is soft-deleted (`deletedAt` set).
- `CourseRepository.getPublishedCourses` ratings (`course.repository.integration.test.ts`):
  - a course with reviews `4` and `2` returns `rating === 3`.
  - a course with no reviews returns `rating === null` (not the old hardcoded `4.8`).

## Traceability (every requirement is covered)

| Requirement | Covered by |
|-------------|-----------|
| FR1 (not enrolled → redirect) | `getEligibility` "no enrollment → ineligible" unit test; Manual #1 |
| FR2 (<100% → redirect) | `getEligibility` "active → ineligible" unit test; Manual #2 |
| FR3 (eligible → form with real data) | `getEligibility` "eligible" unit test; Manual #3 |
| FR4 (already reviewed → read-only) | `getEligibility` "alreadyReviewed" unit test; Manual #5 |
| FR5 (submit disabled until rating≥1 & comment≥50) | Manual #3 (disabled-button steps) |
| FR6 (create persists + success) | `createReview` happy-path unit test; `findByStudentAndCourse` integration; Manual #4 |
| FR7 (server rejects non-completed) | `createReview` "FORBIDDEN" unit test; Edge case A |
| FR8 (server rejects duplicate) | `createReview` "CONFLICT" unit test; Edge case B; DB `@@unique` |
| FR9 (reject bad rating/comment/tag) | `createReviewInput` unit tests; Edge case C |
| FR10 (detail page reflects new review) | Manual #6 |
| FR11 (browse card avg rating + no-ratings state) | `getPublishedCourses` ratings integration test; Manual #7 |

## Manual test scenarios

Prereqs:
```bash
docker-compose up -d        # Postgres on 5433
pnpm db:migrate             # apply add_review_tags migration
pnpm dev                    # start the app
# Seed/use: one published course with ≥1 lesson; a STUDENT account.
# To reach "completed", finish every lesson in the course (sets Enrollment.status = completed).
```

1. **Not enrolled → redirect (FR1):** As a student NOT enrolled in course X, navigate directly to
   `/dashboard/courses/<X>/review` → browser is redirected to `/dashboard/browse/<X>`; the review
   form never renders.
2. **Enrolled but not finished → redirect (FR2):** Enroll in course X, complete only some lessons
   (progress < 100%), then open `/dashboard/courses/<X>/review` → redirected to
   `/dashboard/browse/<X>`; no form.
3. **Eligible form renders with real data + submit gating (FR3, FR5):** Complete every lesson of
   course X (card shows "Completed"), click the completed course → "Leave a review" route. The form
   shows the **real** course title, instructor, completion date, lesson count, and duration (not
   "Python for Data Science / David Kim"). The Submit button is disabled with rating 0 or a comment
   under 50 chars; it enables once rating ≥ 1 and comment ≥ 50 chars. Tags are optional.
4. **Submit a review (FR6):** With rating 5, a 50+ char comment, and two tags selected, click Submit
   → success screen ("Thank You!") with links to My Courses / Browse. In Prisma Studio
   (`pnpm db:studio`), the `course_reviews` row exists with the rating, comment, and the two
   `ReviewTag` values.
5. **Already reviewed → read-only (FR4):** Re-open `/dashboard/courses/<X>/review` for the same
   course → the read-only view shows your rating stars, comment, and tag badges; there is no editable
   input and no Submit button.
6. **Review appears on detail page (FR10):** Open `/dashboard/browse/<X>` → the Student Feedback card
   lists your review, and the average/distribution/review-count reflect it.
7. **Browse card ratings (FR11):** Open `/dashboard/browse` → the card for course X shows the numeric
   average with a star; a published course with zero reviews shows "No ratings yet" instead of a
   number.

## Edge cases & regression

- **A — IDOR / forced submission (FR7):** Call `review.create` (e.g. via the tRPC client/devtools)
  for a course you have NOT completed → server responds `FORBIDDEN`; no row is created. The client
  `disabled` guard is not the boundary.
- **B — Double submit / duplicate (FR8):** Submit a valid review, then call `review.create` again for
  the same course → server responds `CONFLICT`; only one `course_reviews` row exists. The
  `@@unique([courseId, studentId])` constraint is the final backstop against a race.
- **C — Out-of-range input (FR9):** Attempt `review.create` with `rating: 6`, a 10-char comment, or a
  tag not in the enum → rejected with a validation error before the service runs; no row created.
- **D — No N+1 on browse (NFR performance):** Loading `/dashboard/browse` with many courses issues a
  single batched `getAvgRatingByCourseIds` query (one `groupBy`), not one query per card.
- **E — Soft-deleted review:** A soft-deleted review (`deletedAt` set) does not count toward
  `findByStudentAndCourse` (student may review again) nor toward browse-card averages.
- **F — Regression — non-student roles:** `review.getEligibility` / `review.create` reject
  non-`STUDENT` roles via `studentProcedure` (unchanged role gating).
- **G — Regression — existing detail page:** The detail-page rating/distribution computation in
  `getPublishedCourse` is unchanged and still renders for courses with and without reviews.

## Definition of done

- [ ] All automated checks green; new code covered by unit + integration tests.
- [ ] Every FR in `requirements.md` traces to a passing check above.
- [ ] All manual scenarios (#1–#7) pass.
- [ ] Edge cases A–G verified or explicitly accepted.
- [ ] Risks in `spec.md` (authz boundary, duplicate race, N+1) are mitigated.
- [ ] Docs updated where warranted: add a "Reviews" subsection to CLAUDE.md (review router/service,
      eligibility = completed enrollment, tags enum); update roadmap status to delivered. No ADR
      needed (follows existing patterns).