# Spec: Student Course Review

> Requirements in [`requirements.md`](./requirements.md) · plan in [`plan.md`](./plan.md) · checks in [`validation.md`](./validation.md)

## Approach (overview)

Add the missing **write path** for course reviews on top of the existing `CourseReview` model and
read/display surfaces. A new `ReviewService` + `review` tRPC router (both `studentProcedure`) own two
operations: `getEligibility` (drives the page's render decision) and `create` (persists a review
after re-checking eligibility server-side). Eligibility = an `Enrollment` for `(studentId, courseId)`
whose `status === completed` — the signal `lesson.service` already sets when course progress reaches
100% (`lesson.service.ts:204-208`) — so we reuse it rather than recomputing completion. Tags become a
new `ReviewTag` Prisma enum array on `CourseReview` (optional, store-only). The mock review page is
split per ADR-011 into a server component (fetch eligibility → redirect / read-only / form) and a
client form component that owns the `create` mutation. Finally, the hardcoded `rating: 4.8` in
`getPublishedCourses` (`course.repository.ts:293`) is replaced with the real average via the existing
`getAvgRatingByCourseIds` batch query. The course detail page's review list/average/distribution is
unchanged — it already computes from `CourseReview` rows.

The rejected alternative was an upsert/edit flow; requirements lock one-shot reviews (decision #2),
so no update/delete endpoints are introduced.

## Architectural decisions referenced

- **ADR-003 (repository pattern)** — review data access goes through `CourseReviewRepository`
  (extends `BaseRepository`); the service never touches Prisma directly.
- **ADR-004 (role-based tRPC procedures)** — both review procedures are `studentProcedure`;
  `studentId` comes from session context, never client input.
- **ADR-005 (split Prisma schema)** — the `ReviewTag` enum + `tags` column are added to the existing
  `prisma/schema/review.prisma` file.
- **ADR-010 (domain error mapping)** — `ReviewService` throws typed `ReviewError extends DomainError`
  values (`NOT_FOUND`, `FORBIDDEN`, `CONFLICT`, `BAD_REQUEST`) that map to tRPC errors.
- **ADR-011 (component folder architecture)** — the review page is split into a server page + client
  form, each with a colocated `types.ts`; no inline prop types, no nested ternaries.

No new ADR is warranted — this feature follows established patterns end to end.

## Data model

### `prisma/schema/review.prisma` (modified)

```prisma
enum ReviewTag {
  COURSE_CONTENT
  INSTRUCTOR
  PRACTICAL_EXAMPLES
  PACE
  RESOURCES
  EXERCISES

  @@map("review_tag")
}

model CourseReview {
  id String @id @default(cuid())

  courseId String
  course   Course @relation(fields: [courseId], references: [id], onDelete: Cascade)

  studentId String
  student   User   @relation(fields: [studentId], references: [id], onDelete: Cascade)

  rating  Int         // 1..5
  comment String      @db.Text
  tags    ReviewTag[] @default([])   // NEW — optional, store-only

  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")
  deletedAt DateTime? @map("deleted_at")

  @@unique([courseId, studentId])
  @@index([courseId])
  @@index([studentId])
  @@index([deletedAt])
  @@map("course_reviews")
}
```

**Migration (`pnpm db:generate`):** additive only. New enum `review_tag`; new `tags` column on
`course_reviews` with default `[]` — existing rows backfill to an empty array, no destructive steps.
Run `pnpm generate` afterwards to refresh the Prisma client and `prisma/zod`.

## API & contracts

DTOs in `server/entities/review/` (Zod):

```ts
// reviewTag matches the Prisma enum
export const reviewTagSchema = z.nativeEnum(ReviewTag);

export const createReviewInput = z.object({
  courseId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(50),
  tags: z.array(reviewTagSchema).default([]),
});
```

| Procedure | Type / auth | Input → Output | Notes |
|-----------|-------------|----------------|-------|
| `review.getEligibility` | `studentProcedure` (query) | `{ courseId }` → `EligibilityResult` | No writes. Read by the server page to decide redirect / read-only / form. |
| `review.create` | `studentProcedure` (mutation) | `createReviewInput` → `{ id }` | Re-checks eligibility + duplicate server-side; creates one `CourseReview`. |

`EligibilityResult`:

```ts
type EligibilityResult =
  | { state: "ineligible" }                          // not enrolled OR enrollment.status !== completed
  | { state: "alreadyReviewed"; review: ReviewView; course: CourseSummary }
  | { state: "eligible"; course: CourseSummary };

type CourseSummary = {
  id: string; title: string; instructor: string;
  completedDate: string;        // enrollment completion timestamp, formatted
  totalLessons: number; duration: string;
};
type ReviewView = { rating: number; comment: string; tags: ReviewTag[]; createdAt: string };
```

**Authz / validation summary**
- `getEligibility` returns `{ state: "ineligible" }` (not an error) so the page can redirect cleanly.
- `create` throws: `FORBIDDEN` if not enrolled-and-completed (FR7); `CONFLICT` if a review already
  exists for `(courseId, studentId)` (FR8); `BAD_REQUEST`/Zod for rating ∉ 1–5, comment < 50, or an
  out-of-enum tag (FR9). The DB `@@unique` is the final backstop against a race.

## Component / data flow

**Eligibility resolution (service):**

```
getEligibility(studentId, courseId)
  ├─ enrollmentRepository.findByStudentCourse(studentId, courseId)   // status, not cancelled
  │     └─ none OR status !== completed ──────────────► { state: "ineligible" }
  ├─ courseReviewRepository.findByStudentAndCourse(studentId, courseId)
  │     └─ exists (deletedAt null) ──► { state: "alreadyReviewed", review, course }
  └─ else ───────────────────────────► { state: "eligible", course }
```

**Page render (server component) — FR1–FR4:**

```
ReviewCoursePage (server, app/dashboard/courses/[courseId]/review/page.tsx)
  └─ api.review.getEligibility({ courseId })
       ├─ "ineligible"      → redirect("/dashboard/browse/[courseId]")        (FR1, FR2)
       ├─ "alreadyReviewed" → <ReviewReadOnly review course />                 (FR4)
       └─ "eligible"        → <ReviewForm course />  (client, owns mutation)   (FR3)
```

**Submission (happy + failure) — FR5–FR9:**

```
ReviewForm
  submit disabled until rating>=1 && comment.length>=50           (FR5)
     │
     ▼  api.review.create({ courseId, rating, comment, tags })
ReviewService.createReview(studentId, input)
  ├─ enrollment completed?  no → throw ReviewError FORBIDDEN       (FR7)
  ├─ existing review?        yes → throw ReviewError CONFLICT       (FR8)
  └─ courseReviewRepository.create({...})  → { id }                (FR6)
     │  (Zod rejects bad rating/comment/tag before service)        (FR9)
     ▼
  success state → links back to /dashboard/courses                 (mock's success UX, real)
```

**Display — FR10, FR11:**

```
FR10  course detail (/dashboard/browse/[courseId])
        getPublishedCourse → reviews[], rating, ratingDistribution  (UNCHANGED, already live)

FR11  browse list (/dashboard/browse)
        getPublishedCourses:
          ids = courses.map(id)
          ratings = courseReviewRepository.getAvgRatingByCourseIds(ids)   // batched, no N+1
          per course → rating: ratings.get(id) ?? null
        BrowseCourseCard: rating === null → "No ratings yet"; else stars + value
```

## File list

**New**
- `server/entities/review/review.dto.ts` — Zod `createReviewInput`, `reviewTagSchema`, `EligibilityResult` types.
- `server/services/review/review.service.ts` — `ReviewService` (`getEligibility`, `createReview`).
- `server/services/review/review.errors.ts` — `ReviewError extends DomainError`.
- `server/services/review/review.service.test.ts` — unit (mocked repos): eligibility states, create guards.
- `server/api/routers/review.ts` — `reviewRouter` (`getEligibility`, `create`).
- `app/dashboard/courses/[courseId]/review/components/ReviewForm/{index.tsx,types.ts}` — client form, owns `create` mutation.
- `app/dashboard/courses/[courseId]/review/components/ReviewReadOnly/{index.tsx,types.ts}` — read-only existing review.

**Modified**
- `prisma/schema/review.prisma` — add `ReviewTag` enum + `tags` column.
- `server/repositories/courseReview.repository.ts` — add `findByStudentAndCourse`; `create` via base.
- `server/repositories/courseReview.repository.integration.test.ts` — cover create + new finder.
- `server/api/root.ts` — register `review: reviewRouter`.
- `app/dashboard/courses/[courseId]/review/page.tsx` — rewrite as server component (eligibility → redirect/read-only/form).
- `server/repositories/course.repository.ts` — `getPublishedCourses`: real avg rating instead of `4.8`.
- `lib/requests/course/getPublishedCourses.ts` — `PublishedCourse.rating` becomes `number | null`.
- `app/_components/Course/components/BrowseCourses/components/BrowseCourseCard/{index.tsx,types.ts}` — render "No ratings yet" vs stars.

## Sources of truth & reuse

- **Completion:** `Enrollment.status === completed` (single source; set by `lesson.service`). The review
  feature only reads it.
- **Average / distribution on detail:** `course.service.getPublishedCourse` (unchanged).
- **Average on cards:** `CourseReviewRepository.getAvgRatingByCourseIds` (already exists; now actually used).
- **Completion date** in `CourseSummary`: use `enrollment.updatedAt` (the record is updated when status
  flips to `completed`) as the displayed completion date. No dedicated `completedAt` column exists and
  adding one is out of scope.

## Testing strategy

- **Unit** (`review.service.test.ts`, mocked repos): `getEligibility` returns each of the three states;
  `createReview` throws `FORBIDDEN` when not completed, `CONFLICT` when a review exists, succeeds otherwise.
- **Integration** (`courseReview.repository.integration.test.ts`): create persists rating/comment/tags;
  `findByStudentAndCourse` ignores soft-deleted; unique constraint blocks duplicates.
- **Validation doc** (`validation.md`, stage 4) covers manual end-to-end + the browse-card rating UI.

## Non-functional notes

- **Authz:** server-side eligibility + duplicate checks in the service are the security boundary;
  client `disabled` is UX only (NFR security).
- **Performance:** card ratings via one batched `groupBy` query — no per-card lookups (NFR performance).
- **Reliability:** double-submit cannot duplicate — explicit `CONFLICT` pre-check + `@@unique` backstop.
- **Privacy:** only rating, comment, enum tags stored; soft-delete respected by `findByStudentAndCourse`.