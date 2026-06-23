# Plan: Student Course Learning

## Routes

| Route | Behaviour |
|---|---|
| `/dashboard/courses` | Lists enrolled courses with live progress, direct lesson link |
| `/dashboard/courses/[courseId]/learn` | Server redirect → resolves and redirects to the next lesson |
| `/dashboard/courses/[courseId]/learn/[lessonId]` | Lesson view: content + sidebar + quiz |
| `/dashboard/courses/[courseId]/review` | Post-completion review (placeholder) |

The `/learn` redirect page is kept as a stable bookmark-friendly entry point. The dashboard "Continue Learning" button links directly to `/learn/[nextLessonId]` resolved at page-render time, skipping the redirect round-trip.

## tRPC endpoints

| Procedure | Auth | Description |
|---|---|---|
| `course.getEnrolledCourses` | `studentProcedure` | Enrolled courses with live progress |
| `course.getStudentCourse` | `studentProcedure` | Course structure with per-lesson completion |
| `lesson.markComplete` | `studentProcedure` | Upserts `LessonProgress { isCompleted: true }` |
| `lesson.markIncomplete` | `studentProcedure` | Upserts `LessonProgress { isCompleted: false }` |
| `quiz.submit` | `studentProcedure` | Records a `QuizAttempt`, returns correctness |

## Progress computation

`EnrollmentService.getStudentEnrolledCourses` queries sections → lessons → `progresses` (filtered by `studentId`) in a single Prisma query ordered by `section.order` and `lesson.order`. No `CourseProgress` table is read. Computed values:

```
allLessons   = sections.flatMap(s => s.lessons)          // ordered
completedLessons = allLessons.filter(l => l.progresses[0]?.isCompleted).length
totalLessons     = allLessons.length
progressPercent  = totalLessons > 0 ? round(completedLessons / totalLessons * 100) : 0
nextLessonId     = first lesson where !isCompleted ?? allLessons[0]?.id ?? null
```

## Key components

```
CourseLearnView
  ├── LessonSidebar         — section/lesson tree, completion badges, active highlight
  ├── LessonContent         — video player + rich text + resource list
  ├── LessonCompletionToggle — mark complete / incomplete button
  └── QuizPlayer            — question cards with immediate feedback
```

## Lesson navigation

`CourseLearnView` receives full course structure (all sections + lessons with `isCompleted`) and the current lesson id from the server. Client-side prev/next navigation is derived from the flat lesson list — no additional fetches needed.