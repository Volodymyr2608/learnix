# Roadmap

Phases are sized as 1–2 week slices, each delivering something usable. Core LMS features ship first to give AI features a solid foundation to build on.

Legend: ✅ done · 🔄 in progress · ⬜ planned

---

## Phase 1 — Auth & roles ✅

- Email/password sign-up and sign-in
- GitHub and Google OAuth
- Role system: `STUDENT | INSTRUCTOR | ADMIN`
- Role-gated tRPC procedures (`protectedProcedure`, `instructorProcedure`, etc.)
- Instructor profile creation (onboarding flow)

---

## Phase 2 — Course authoring ✅

- Course CRUD (title, description, thumbnail, preview video, pricing)
- Section and lesson management
- Drag-and-drop curriculum reordering
- Course publish / unpublish
- Vercel Blob file uploads (images ≤ 2 MB, video ≤ 100 MB)

---

## Phase 3 — AI course builder ✅ / 🔄

- Multi-step AI chat guides instructor through course creation
- LangChain + OpenAI `gpt-4o-mini` via streaming SSE
- Draft state persisted to `CourseGeneration` / `CourseGenerationMessage`
- Live preview panel alongside chat

Remaining: polish step transitions, error recovery, content export to real course records.

---

## Phase 4 — Student learning experience 🔄

- Enrolled courses dashboard with live progress at `/dashboard/courses`
- "Continue Learning" links directly to next incomplete lesson
- Lesson view: video player, rich text content, resource list
- Mark lesson complete / incomplete; progress computed from `LessonProgress` records
- Sidebar with section/lesson tree and completion state
- Spec: [docs/specs/2026-05-07-student-course-learning/](2026-05-07-student-course-learning/requirements.md)

---

## Phase 5 — Enrollment & payments ⬜

- Free and paid course enrollment flow
- Enrollment gating (check before allowing lesson access)
- Enrollment stats for instructors
- Basic payment integration (Stripe) for paid courses

---

## Phase 6 — Quizzes (manual) ✅

- Instructor creates and edits multiple-choice quizzes per lesson (`QuizTab` in lesson editor, `quiz.upsertMany` / `quiz.deleteByLesson`)
- Student takes quiz and sees immediate correct/incorrect feedback (`QuizPlayer`, `QuestionCard`, `quiz.submit`)
- Each question answered at most once per student (`QuizAttempt` model, `AlreadyAttemptedError` guard)

Deferred: configurable retake policy; true/false question type.

---

## Phase 7 — Reviews & discovery ⬜

- Students leave star rating + written review after completing a course
- Average rating displayed on course card and detail page
- Course search and category filtering
- Instructor public profile page

---

## Phase 8 — AI learning assistant ⬜

- Per-course AI tutor available to enrolled students
- Scoped to lesson content of the current course (retrieval-augmented)
- LangChain agent with `search_course_content` tool
- Streamed responses via SSE, same pattern as course builder
- Conversation history persisted per student + course

---

## Phase 9 — AI quiz generation ✅

- Instructor clicks **Generate with AI** in the lesson editor quiz tab
- `QuizAIService` invokes a LangChain `createReactAgent` with two read-only tools (`get_lesson_content`, `get_existing_quizzes`)
- Agent outputs 3–5 structured multiple-choice questions via `model.withStructuredOutput`; semantic validation + up to 3 retries on violation
- `GenerateQuizDialog` lets the instructor review and edit questions before saving
- Saving atomically replaces the lesson's full quiz set (`quiz.upsertMany`)
- Spec: [docs/specs/2026-05-06-ai-quiz-generator/](specs/2026-05-06-ai-quiz-generator/requirements.md)

---

## Phase 10 — Personalized learning path ⬜

- AI analyses student progress and quiz scores
- `recommend_next_lesson` tool suggests what to study next
- Recommendations surfaced on the student dashboard
- Tracks learning pace and adjusts suggestion cadence

---

## Phase 11 — Admin & platform health ⬜

- Admin dashboard: user management, course moderation
- Soft-delete and reinstatement of courses
- Basic analytics: enrollment counts, completion rates, revenue

---

## Not yet scheduled

- Mobile app
- Live sessions / webinars
- Certificates of completion
- Multi-language / i18n
- Cohort or team enrollments
