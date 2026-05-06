# Requirements: Student Enrollment

## Overview

Students browse published courses and enroll in them. Enrollment tracks progress through lessons. A student cannot enroll in a course they instruct.

## Data model

```
Enrollment
  ├── id
  ├── studentId → User
  ├── courseId  → Course
  ├── status: active | completed | cancelled
  ├── progress: Float (0–100, percentage)
  ├── enrolledAt, completedAt, lastAccessedAt
  └── [unique: studentId + courseId]

CourseProgress
  ├── studentId, courseId
  ├── progress: Float
  ├── completedLessons, totalLessons
  └── [unique: studentId + courseId]
```

## Business rules

- Only users with `role = STUDENT` can call `course.enroll` and `course.getEnrolledCourses` (enforced by `studentProcedure`).
- A student cannot enroll in a course they instruct (`course.instructorId === studentId` is rejected).
- A student can only be enrolled once per course (DB unique constraint `[studentId, courseId]`).
- Enrolling in an already-active enrollment is a no-op (returns `{ alreadyEnrolled: true }`).
- Only published, non-deleted courses can be enrolled in.
