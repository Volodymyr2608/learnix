# Roadmap

Phases are sized as 1–2 week slices, each delivering something usable. Core LMS features ship first to give AI features a solid foundation to build on. The **Delivered** section tracks what is built; **Next up** is the forward-looking, value-ranked plan.

Legend: ✅ done · 🔄 in progress · ⬜ planned

---

# Delivered

## Phase 1 — Auth & roles ✅

- Email/password sign-up and sign-in
- GitHub and Google OAuth
- Role system: `STUDENT | INSTRUCTOR | ADMIN`
- Role-gated tRPC procedures (`protectedProcedure`, `instructorProcedure`, etc.)
- Instructor profile creation (onboarding flow)
- Email verification on sign-up + password-reset email (Better Auth, server-side)

---

## Phase 2 — Course authoring ✅

- Course CRUD (title, description, thumbnail, preview video, pricing)
- Section and lesson management
- Drag-and-drop curriculum reordering
- Course publish / unpublish
- Vercel Blob file uploads (images ≤ 2 MB, video ≤ 100 MB)

---

## Phase 3 — AI course builder ✅

- Multi-step AI chat guides instructor through course creation (`basic → objectives → requirements → curriculum`)
- **LangGraph `StateGraph`** + OpenAI `gpt-4o-mini` via streaming SSE (ADR-016)
- Intent classification, confidence scoring + auto-advance, revision flow, tool calls
- Draft state persisted to `CourseGeneration` / `CourseGenerationMessage`
- Live preview panel alongside chat
- Spec: [2026-05-22-langgraph-course-builder/](2026-05-22-langgraph-course-builder/requirements.md)

---

## Phase 4 — Student learning experience ✅

- Enrolled courses dashboard with live progress at `/dashboard/courses`
- "Continue Learning" links directly to next incomplete lesson
- Lesson view: video player, rich text content, resource list
- Mark lesson complete / incomplete; progress computed from `LessonProgress` records
- Sidebar with section/lesson tree and completion state
- Spec: [2026-05-07-student-course-learning/](2026-05-07-student-course-learning/requirements.md)

---

## Phase 5 — Enrollment ✅ · Payments ⬜

- Free course enrollment flow with `Enrollment` status tracking ✅
- Re-enrollment / re-activation ✅
- **Paid enrollment, Stripe checkout, and payment gating remain planned** — see **Next up → P0.2**.

---

## Phase 6 — Quizzes (manual) ✅

- Instructor creates and edits multiple-choice quizzes per lesson (`QuizTab`, `quiz.upsertMany` / `quiz.deleteByLesson`)
- Student takes quiz and sees immediate correct/incorrect feedback (`QuizPlayer`, `QuestionCard`, `quiz.submit`)
- Each question answered at most once per student (`QuizAttempt` model, `AlreadyAttemptedError` guard)

> Deferred: configurable retake policy, per-question analytics, more question types — see **Next up → P1.7**.

---

## Phase 7 — Discovery ✅ · Reviews ⬜

- **Semantic search & recommendations ✅** — pgvector cosine similarity (ADR-012); `search.semantic` + `search.recommendations`; "Recommended for you" rail; category/level filters. Spec: [2026-05-08-semantic-search-recommendations/](2026-05-08-semantic-search-recommendations/requirements.md)
- **Reviews & ratings ⬜** — `CourseReview` model + repository and the review-page UI exist, but the submit is a mock and ratings are never aggregated — see **Next up → P0.3**.

---

## Phase 8 — AI learning assistant ✅

- Per-lesson AI tutor for enrolled students (`app/api/chat/lesson/route.ts`, SSE)
- ReAct agent with tools (search related lessons, fetch concepts, check quiz answers) + off-topic guardrail
- Conversation history persisted per student + lesson (`LessonAssistantConversation`)
- Spec: [2026-05-05-ai-lesson-assistant/](2026-05-05-ai-lesson-assistant/requirements.md)

---

## Phase 9 — AI quiz generation ✅

- Instructor clicks **Generate with AI** in the lesson editor quiz tab
- `QuizAIService` invokes `createAgent` from `langchain` (ADR-008) with two read-only tools (`get_lesson_content`, `get_existing_quizzes`)
- Agent outputs 3–5 structured multiple-choice questions via `model.withStructuredOutput`; semantic validation + up to 3 retries
- `GenerateQuizDialog` lets the instructor review and edit questions before saving
- Spec: [2026-05-06-ai-quiz-generator/](2026-05-06-ai-quiz-generator/requirements.md)

---

## Phase 10 — Personalized learning path ✅

- AI analyses student progress and quiz scores; identifies weak concepts (`ConceptMastery`)
- `learningPath.getForCourse` / `regenerate` generate a personalised study plan
- Cached output (`LearningPathCache`) with stale-check; surfaced on the course learning view
- Spec: [2026-05-12-personalized-learning-path/](2026-05-12-personalized-learning-path/requirements.md)

---

## Phase A — Lesson auto-summary & insights ✅

- AI-generated per-lesson summary, key concepts, and glossary (`lessonInsightsAI` router, `LessonInsights` model)
- Content-hash change detection to avoid stale regeneration
- Spec: [2026-05-08-lesson-auto-summary/](2026-05-08-lesson-auto-summary/requirements.md)

## Phase B — Lifecycle email & automations ✅

- Transactional email via **Resend + React Email** (welcome, enrollment, certificate, engagement) — ADR-015
- **n8n lifecycle automations** (certificate earned, near-completion, inactivity) with dedup logging — ADR-014
- Per-user `emailNotificationsEnabled` opt-out honored for non-critical mail
- Specs: [2026-05-12-resend-react-email/](2026-05-12-resend-react-email/requirements.md) · [2026-05-12-n8n-lifecycle-automations/](2026-05-12-n8n-lifecycle-automations/requirements.md)

## Phase C — Certificates of completion ✅

- On-completion PDF certificate (`@react-pdf/renderer`), JWT-gated download (`CERTIFICATE_SECRET`)
- Certificate email with download link via n8n workflow

> Follow-up: persisted certificate records + public verification — see **Next up → P1.8**.

---

## Phase D — Authentication completion ✅

- Forgot-password page (`/forgot-password`) with 3-minute resend cooldown — fixes the live 404
- Reset-password page (`/reset-password?token=...`) with `?reset=true` toast on sign-in
- Account settings hub at `/dashboard/settings` (tabbed: Profile, Password, Email, Notifications, Connected Accounts, Sessions, Danger Zone)
- Better Auth `changeEmail` (confirmation to current address), `deleteUser` with `beforeDelete` instructor-course soft-delete (FR5), `accountLinking` (GitHub + Google)
- Email templates: `auth.email-change`, `auth.account-deletion` (both CRITICAL, bypass opt-out)
- `user.updateProfile` and `user.updateEmailPreferences` tRPC procedures
- Spec: [2026-06-11-auth-completion/](2026-06-11-auth-completion/requirements.md)

---

# Next up

Forward-looking work, ranked by business value vs. effort. **Value:** High / Med / Low · **Effort:** S / M / L.

## P0 — Production blockers

### P0.2 — Payments & monetization (Stripe) — *High · L*
No revenue is possible today. Stripe Checkout, paid-enrollment gating, `Payment`/`Purchase` model (`prisma/schema/payments.prisma`), webhook route, instructor payout/revenue tracking. Needs a spec.

### P0.3 — Wire course reviews backend — *High · S*
Best value/effort: `CourseReview` model + `courseReview.repository.ts` + the review UI already exist; add a `courseReview` service + router, wire the (currently mock) submit, auto-aggregate `averageRating` / `reviewsCount`, and display reviews on course cards/detail.

### P0.4 — Replace mock dashboard data with real queries — *High · M*
Instructor dashboard, instructor student-management, and student dashboard stat cards render hardcoded numbers. Wire to real `Enrollment` / `CourseProgress` / `CourseReview` aggregations via an `analytics` (or extended `instructor`) router.

## P1 — High value, moderate effort

### P1.5 — Admin dashboard & user/role management — *Med-High · M*
`ADMIN` role + `adminProcedure` exist with no UI; roles are assigned by manual DB edits. Add `app/admin/` + an `admin` router (list/search users, change role, moderate/reinstate courses).

### P1.6 — In-app notification center — *Med · M*
Email + n8n exist; add an in-app inbox (bell + read/unread state) to complement them.

### P1.7 — Quiz enhancements — *Med · M*
Configurable retake policy, per-question analytics (feeds instructor dashboard), more question types (true/false, multi-select).

### P1.8 — Certificate records & public verification — *Med · S-M*
Certificates generate on-demand but persist no record. Add a `Certificate` model + public `/verify/[code]` page + bulk export.

## P2 — Enhancements & differentiation

- **Advanced search filters** (price, rating, instructor, language) on top of semantic search — *Med · S-M*
- **Instructor → student messaging / announcements** — *Med · M*
- **Engagement: badges, streaks, learning goals** — *Low-Med · M*
- **Lesson rich-text WYSIWYG editor** — *Med · M* — spec exists: [2026-05-09-lesson-rich-text-editor/](2026-05-09-lesson-rich-text-editor/requirements.md) ⬜
- **Instructor insights agent** — *Med · M* — spec exists: [2026-05-08-instructor-insights-agent/](2026-05-08-instructor-insights-agent/requirements.md) ⬜
- **Course versioning / change history** — *Low · L*

---

## Not yet scheduled

- Mobile app
- Live sessions / webinars
- Multi-language / i18n
- Cohort or team enrollments
