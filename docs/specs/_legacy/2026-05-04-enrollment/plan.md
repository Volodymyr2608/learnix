# Plan: Student Enrollment

## tRPC endpoints (`courseRouter`)

| Procedure | Auth | Description |
|-----------|------|-------------|
| `course.enroll` | `studentProcedure` | Enroll or re-activate a cancelled enrollment |
| `course.getEnrolledCourses` | `studentProcedure` | List enrolled courses with progress |

## Enroll flow

1. Student views a published course detail page (`dashboard/browse/[courseId]`).
2. `CourseDetailEnrollCard` shows the "Enroll" button.
3. Clicking opens `EnrollConfirmDialog`.
4. On confirm, `api.course.enroll.mutate(courseId)` is called.
5. `EnrollmentService.enrollInCourse` runs:
   - Verifies the course exists, is published, and is not soft-deleted.
   - Rejects if `course.instructorId === studentId` (instructors cannot enroll in their own courses).
   - If no enrollment record exists → creates one with `status: active`.
   - If a `cancelled` enrollment exists → reactivates it (`status: active`, resets `enrolledAt`, clears `completedAt`).
   - Returns `{ alreadyEnrolled: boolean }`.

## Progress tracking

- `CourseProgress` tracks `completedLessons` / `totalLessons` and a `progress` float (0–100).
- `EnrollmentService.getStudentEnrolledCourses` derives `status` as:
  - `"Completed"` — if `enrollment.status === completed` OR `completedLessons >= totalLessons` (and `totalLessons > 0`).
  - `"In Progress"` — otherwise.
- `totalLessons` falls back to counting lessons across sections if no `CourseProgress` row exists yet.
