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

## Phase 4 — Student learning experience ⬜

- Video player for lesson content
- Lesson and course progress tracking (`CourseProgress`)
- Mark lesson complete / resume where left off
- Enrolled courses dashboard

---

## Phase 5 — Enrollment & payments ⬜

- Free and paid course enrollment flow
- Enrollment gating (check before allowing lesson access)
- Enrollment stats for instructors
- Basic payment integration (Stripe) for paid courses

---

## Phase 6 — Quizzes (manual) ⬜

- Instructor creates quizzes per lesson or section (multiple-choice, true/false)
- Student takes quiz and sees result
- Quiz score recorded against progress
- Retake policy (configurable per quiz)

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

## Phase 9 — AI quiz generation ⬜

- Instructor triggers quiz generation from a lesson or section
- LangChain agent reads lesson content and outputs structured quiz questions
- Instructor reviews and edits before publishing
- Reuses the quiz schema from Phase 6

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
