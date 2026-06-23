# Requirements: Student Course Review

> Design in [`spec.md`](./spec.md) · plan in [`plan.md`](./plan.md) · checks in [`validation.md`](./validation.md)

## Status: planned — student experience (post-completion feedback)

- Date: 2026-06-19
- Author: Volodymyr Pelykh
- Branch: `feat/review-course`

## Problem

The student review page (`app/dashboard/courses/[courseId]/review/page.tsx`) is a non-functional
mock: the course (`Python for Data Science`, instructor `David Kim`, etc.) is hardcoded, submission
only flips a local `setSubmitted(true)` flag (`page.tsx:38-42`), and the "Quick Feedback" tags
(`page.tsx:188-200`) map to no persisted field. Nothing reaches the database.

Meanwhile the data model and the *display* side already exist:

- `CourseReview` (`prisma/schema/review.prisma`) — `rating Int`, `comment String`,
  `@@unique([courseId, studentId])`, soft-delete.
- `CourseReviewRepository` (`server/repositories/courseReview.repository.ts`) — read-only methods
  (instructor stats, avg-by-course, recent-by-instructor).
- The public course detail page (`app/dashboard/browse/[courseId]/page.tsx`) already renders real
  reviews, average rating, and rating distribution via
  `course.service.getPublishedCourse` (`server/services/course/course.service.ts:412-489`) feeding
  the existing `StudentFeedbackCard`.

What is missing is the **write path**: there is no review service, no review tRPC router, and no
create endpoint. A student who completes a course cannot actually leave a review. The
`EnrolledCourseCard` already links completed courses to `/dashboard/courses/[courseId]/review`
(`app/_components/Course/components/MyCourses/components/EnrolledCourseCard/index.tsx:18-19`), so the
entry point dead-ends at the mock form.

## Goal

- A student who has **completed** a course can submit exactly one rating + comment review, which is
  persisted to `CourseReview` and immediately reflected on the course detail page.
- Ineligible visitors (not enrolled, or enrolled but not 100% complete) never see the form.
- A student who already reviewed a course sees their existing review in a read-only state and cannot
  submit a second one.
- The review form shows real course data (title, instructor, completion date, lesson count,
  duration) instead of hardcoded mock values.
- Browse course cards surface each course's average star rating so ratings are visible before the
  detail page.

## Scope decisions (locked)

1. **Eligibility = enrolled + 100% complete:** only a student with an active enrollment whose course
   progress is 100% may submit a review — rules out reviews from non-finishers and non-enrollees.
2. **One review per course, no editing:** the existing `@@unique([courseId, studentId])` is the
   ceiling. A student who already reviewed sees a read-only "already reviewed" state — no update or
   delete flow in this feature (rules out edit endpoints and prefilled-edit UX).
3. **Ineligible → redirect:** a student who opens the review page while not eligible is redirected to
   the course (no inline "come back later" form state) — keeps the form surface single-purpose.
4. **Tags persisted as a Prisma enum array:** add a `ReviewTag` enum and `tags ReviewTag[]` column to
   `CourseReview` — type-safe at the DB level, no join table. Fixed set: Course Content, Instructor,
   Practical Examples, Pace, Resources, Exercises.
5. **Tags are optional and store-only:** a review may be submitted with zero tags; tags are captured
   for future analytics but are **not** displayed in the public reviews list in this feature.
6. **Comment required, ≥50 characters; rating required, 1–5:** matches the mock's stated minimum.
7. **Display: detail-page list already done; add ratings to browse cards.** The course detail review
   list/average/distribution already works and is reused as-is. New display work is limited to
   average-rating stars on browse `CourseCard`s.

## Assumptions & constraints

- "100% complete" is read from the existing course-progress source used by `EnrolledCourseCard`
  (`course.progress === 100` / status `Completed`); this feature reuses that signal rather than
  defining a new completion rule.
- Eligibility and one-per-course are enforced **server-side** in the review service; client guards
  are UX only and never the security boundary.
- Adding `ReviewTag` + `tags` requires a Prisma migration (`pnpm db:generate`); existing rows
  default to an empty tag array.
- The review write path follows the project's routers → services → repositories layering;
  `CourseReviewRepository` is extended with a create method (it is currently read-only).
- No change to how the detail page computes rating/distribution — the new write simply produces more
  `CourseReview` rows it already consumes.

## Functional requirements

### Eligibility & page state

| #   | Surface              | Behaviour (acceptance criteria) |
|-----|----------------------|---------------------------------|
| FR1 | Review page (load)   | Given a student who is **not enrolled** in the course, when they open `/dashboard/courses/[courseId]/review`, they are redirected to the course (browse detail / learn) and the form never renders. |
| FR2 | Review page (load)   | Given an enrolled student whose progress is **< 100%**, when they open the review page, they are redirected to the course; the form never renders. |
| FR3 | Review page (load)   | Given an eligible student (enrolled + 100% complete) who has **not** reviewed yet, the form renders with real course data: title, instructor name, completion date, total lessons, and duration. |
| FR4 | Review page (load)   | Given a student who has **already** reviewed this course, the page shows their existing rating, comment, and tags in a **read-only** state — no editable inputs, no submit button. |

### Submission

| #   | Surface            | Behaviour (acceptance criteria) |
|-----|--------------------|---------------------------------|
| FR5 | Review form        | The submit button is disabled until rating ≥ 1 **and** comment length ≥ 50 characters; tags are optional and never block submission. |
| FR6 | Create mutation    | Given an eligible student submitting a valid review, a `CourseReview` row is created with their `studentId`, the `courseId`, the rating (1–5), the comment, and the selected tags (possibly empty); the student then sees a success confirmation. |
| FR7 | Create mutation    | The server rejects a submission from any student who is not enrolled or not 100% complete (independent of the client guard), returning a typed error and creating no row. |
| FR8 | Create mutation    | The server rejects a second review for the same `(courseId, studentId)` with a typed "already reviewed" error and creates no duplicate row. |
| FR9 | Create mutation    | The server rejects rating outside 1–5, a comment shorter than 50 characters, or any tag not in the `ReviewTag` enum — with a validation error and no row created. |

### Display

| #    | Surface                 | Behaviour (acceptance criteria) |
|------|-------------------------|---------------------------------|
| FR10 | Course detail page      | A newly submitted review appears in the existing `StudentFeedbackCard` list and is included in the course's average rating, review count, and rating distribution (reuses current `getPublishedCourse` logic). |
| FR11 | Browse `CourseCard`     | Each browse course card displays the course's average star rating (and review count); a course with zero reviews shows a clear "no ratings yet" treatment rather than a misleading 0. |

## Non-functional requirements

| Aspect            | Requirement |
|-------------------|-------------|
| Security / authz  | Create endpoint is a `studentProcedure`; eligibility (enrolled + completed) and one-per-course are enforced server-side, not just in the UI. `studentId` is taken from the session, never from client input. |
| Reliability       | Duplicate submission (double-click / retry) cannot create two rows — guarded by the unique constraint and an explicit pre-check returning a typed error. |
| Accessibility/UX  | Star rating is keyboard-operable; the read-only and success states are announced clearly; ineligible redirect is immediate with no flash of the form. |
| Performance       | Browse card ratings are fetched in a single batched query (e.g. `getAvgRatingByCourseIds`) — no per-card N+1. |
| Observability     | Server-side review-service errors (ineligible, duplicate, validation) are logged with `courseId`/`studentId` context, consistent with existing service `.errors.ts` patterns. |
| Data / privacy    | Only rating, comment, and enum tags are stored; no free-text tags. Soft-delete (`deletedAt`) is respected by all reads. |

## Success metrics

- 0 reviews can be created by ineligible users (verified by integration tests for FR7/FR8/FR9).
- Completed-course students can submit a review end-to-end and see it on the detail page within one
  page refresh.
- Browse cards show an average rating for every course that has ≥ 1 review.

## Out of scope (deferred)

- Editing or deleting an existing review (one-shot only this feature).
- Displaying tags publicly in the reviews list (stored-only for now).
- Instructor replies to reviews, review moderation/flagging, or admin moderation tooling.
- Helpful/upvote counts, sorting, or filtering of the reviews list.
- Notifying the instructor when a new review is posted.
- Recomputing/denormalizing `Course.averageRating` (detail page already computes from rows live).

## Open questions

- None — all scope decisions are locked above.