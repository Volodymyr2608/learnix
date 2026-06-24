# Requirements: Student Course Learning

## Overview

Enrolled students access their courses through the "My Courses" dashboard, resume from their last incomplete lesson, consume lesson content (video, rich text, resources), track per-lesson completion, and take embedded quizzes. Progress shown on the dashboard reflects the real state of `LessonProgress` records.

## User stories

- As a student, I see all my enrolled courses with accurate progress on `/dashboard/courses`.
- As a student, "Continue Learning" takes me directly to the next incomplete lesson without an extra redirect.
- As a student, I can mark a lesson complete or incomplete from the lesson view.
- As a student, completing a lesson updates progress immediately the next time I visit the dashboard.
- As a student, I can navigate between lessons via a sidebar that shows completion state for every lesson.
- As a student, I can take the quiz embedded in a lesson and see immediate correct/incorrect feedback.

## Data model

```
LessonProgress
  ├── lessonId  → Lesson
  ├── studentId → User
  ├── isCompleted: Boolean
  ├── completedAt: DateTime?
  └── [unique: lessonId + studentId]
```

`CourseProgress` exists in the schema as a denormalized cache but is **not used** for dashboard display. All progress values are computed live from `LessonProgress` records to avoid stale reads.

## Business rules

- Only users with `role = STUDENT` and an active enrollment can access lesson content.
- An enrollment with `status = cancelled` is treated as no enrollment.
- `completedLessons` = count of `LessonProgress` rows where `isCompleted = true` for the student across all non-deleted lessons of the course.
- `progress%` = `completedLessons / totalLessons * 100`, rounded to nearest integer; 0 when `totalLessons = 0`.
- Course status on the dashboard is `"Completed"` when `enrollment.status = completed` OR `completedLessons >= totalLessons > 0`; otherwise `"In Progress"`.
- The "next lesson" for the "Continue Learning" link is the first lesson (by section order, then lesson order) where `LessonProgress.isCompleted` is false or absent, falling back to the first lesson of the course.
- A completed course shows a "Review Course" button linking to `/dashboard/courses/[courseId]/review` instead of "Continue Learning".