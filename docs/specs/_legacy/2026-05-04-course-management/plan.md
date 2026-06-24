# Plan: Course Management

## tRPC endpoints (`courseRouter`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `course.create` | `instructorProcedure` | Creates course + sections + lessons in a transaction |
| `course.update` | `instructorProcedure` | Updates course; syncs sections/lessons (upsert + delete removed) |
| `course.delete` | `instructorProcedure` | Soft-deletes the course |
| `course.getOwnCourses` | `instructorProcedure` | Returns all courses for the authenticated instructor |
| `course.getOwnCourse` | `instructorProcedure` | Returns one course (ownership-gated) |
| `course.getCoursesStats` | `instructorProcedure` | Aggregated stats for instructor's courses |
| `course.getPublishedCourses` | `protectedProcedure` | All published, non-deleted courses |
| `course.getPublishedCourse` | `protectedProcedure` | Full course detail with instructor stats, reviews, curriculum |

## Create flow

1. Instructor fills the form (`CourseFormProvider` wraps `BasicInformationForm`, `CourseMediaForm`, `ObjectivesForm`, `RequirementsForm`, `PricesForm`, `CurriculumForm`).
2. On submit, `useCourseForm` validates via Zod (`courseSchema`).
3. If a `File` thumbnail/video is present, it is uploaded to Vercel Blob first (`uploadMedia` helper).
4. The resolved URLs replace the `File` objects in the payload.
5. `api.course.create.mutate(payload)` is called.
6. `CourseService.createCourse` runs in a transaction: creates `Course`, then sections, then lessons.

## Update flow

Same as create, but:
1. Existing sections/lessons are synced: IDs present in payload are updated, IDs absent are deleted, items without an ID are created.
2. If a new thumbnail/video URL differs from the stored one, the old blob is deleted (`vercelService.deleteFileFromVercelStorage`).

## Section & lesson ordering

- Sections have an `order` integer field; the `CurriculumForm` uses `@dnd-kit` for drag-to-reorder.
- `useReorderSections` manages local reorder state and updates `order` values before save.
- Lesson `order` is derived from array position on save.

## Publish / draft

- `StatusCourse` form card shows the current status and provides a toggle.
- Setting `status = "published"` makes the course visible in `getPublishedCourses`.
- Only published, non-deleted courses can be enrolled in.

## Soft delete

- `deletedAt` is set on delete; the course is not removed from the DB.
- All repository queries that use `BaseRepository.buildWhere` automatically filter `deletedAt: null` when `isSoftDelete = true` on the course repository.
