# Validation: Student Course Learning

## Manual scenarios

### S1 — Dashboard shows accurate progress

1. Sign in as STUDENT enrolled in a course with 5 lessons.
2. Mark 2 lessons complete via the lesson view.
3. Navigate to `/dashboard/courses`.
4. **Verify**: progress bar shows 40%, "2/5 lessons" displayed.

### S2 — Continue Learning links directly to next incomplete lesson

1. As enrolled STUDENT, complete lessons 1 and 2 of a 5-lesson course.
2. Navigate to `/dashboard/courses`.
3. Click **Continue Learning**.
4. **Verify**: browser lands directly on lesson 3's URL (`/learn/[lesson3Id]`) with no intermediate redirect page rendered.

### S3 — Mark lesson complete / incomplete

1. Open any lesson as enrolled STUDENT.
2. Click **Mark Complete**.
3. **Verify**: lesson shows as completed in the sidebar; `LessonProgress` row has `isCompleted = true`.
4. Click **Mark Incomplete**.
5. **Verify**: lesson reverts; `LessonProgress` row has `isCompleted = false`.

### S4 — Course status flips to Completed

1. As enrolled STUDENT, mark all lessons in a course complete.
2. Navigate to `/dashboard/courses`.
3. **Verify**: course card shows `"Completed"` badge and **Review Course** button instead of **Continue Learning**.

### S5 — Unenrolled student cannot access lesson

1. As a STUDENT with no enrollment (or `status = cancelled`), attempt to navigate to `/dashboard/courses/[courseId]/learn/[lessonId]`.
2. **Verify**: `notFound()` is returned (404 page shown).

### S6 — Auth gates

| Action | Role | Expected |
|---|---|---|
| `lesson.markComplete` | INSTRUCTOR | `FORBIDDEN` |
| `lesson.markComplete` | anonymous | `UNAUTHORIZED` |
| `course.getEnrolledCourses` | INSTRUCTOR | `FORBIDDEN` |

### S7 — Quiz feedback

1. As enrolled STUDENT, open a lesson with a quiz.
2. Select a wrong answer and submit.
3. **Verify**: incorrect answer highlighted, correct answer shown.
4. Attempt the same question again.
5. **Verify**: `AlreadyAttemptedError` prevents re-submission.