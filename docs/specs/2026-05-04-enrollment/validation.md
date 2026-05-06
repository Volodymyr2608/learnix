# Validation: Student Enrollment

## Manual scenarios

### S1 — Happy path enrollment

1. Sign in as STUDENT.
2. Browse to a published course detail page.
3. Click **Enroll** and confirm in the dialog.
4. **Verify**: redirected or shown confirmation; `Enrollment` row exists in DB with `status = active`.
5. Navigate to the enrolled courses dashboard.
6. **Verify**: the course appears with `"In Progress"` status.

### S2 — Re-enroll after cancellation

1. Cancel an active enrollment (directly in DB: set `status = cancelled`).
2. As the STUDENT, click **Enroll** again on the same course.
3. **Verify**: enrollment is reactivated (`status = active`, `enrolledAt` reset, `completedAt` cleared).

### S3 — Already enrolled (no-op)

1. As an already-enrolled STUDENT, attempt to enroll again.
2. **Verify**: API returns `{ alreadyEnrolled: true }`; no duplicate `Enrollment` row created.

### S4 — Instructor cannot enroll in own course

1. Sign in as INSTRUCTOR.
2. Attempt to call `course.enroll` on one of their own courses (via browser network tab or curl).
3. **Verify**: request rejected.

### S5 — Auth gates

| Action | Role | Expected |
|---|---|---|
| Call `course.enroll` | INSTRUCTOR | `FORBIDDEN` |
| Call `course.getEnrolledCourses` | INSTRUCTOR | `FORBIDDEN` |
| Call `course.enroll` with no session | anonymous | `UNAUTHORIZED` |

### S6 — Progress tracking

1. As enrolled STUDENT, complete lessons one by one.
2. **Verify**: `CourseProgress.completedLessons` increments after each; `progress` float updates accordingly.
3. Complete all lessons.
4. **Verify**: status shown as `"Completed"` on the dashboard.
