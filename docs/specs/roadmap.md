# Roadmap

Phases are sized as 1–2 week slices, each delivering something usable. Core LMS features ship first to
give AI features a solid foundation to build on. The **Delivered** section tracks what is built;
**Next up** is the forward-looking, value-ranked plan.

Legend: ✅ done · 🔄 in progress · ⬜ planned

> **Specs:** current per-feature specs live in [`features/_index.md`](features/_index.md). Features
> shipped before 2026-06-23 have no living spec — the code and its tests are their record; the
> retired dated spec folders remain in git history.

---

# Delivered

## Phase 1 — Auth & roles ✅

- Email/password sign-up and sign-in; GitHub and Google OAuth
- Role system: `STUDENT | INSTRUCTOR | ADMIN`; role-gated tRPC procedures
- Instructor profile creation (onboarding flow)
- Email verification + password reset (Better Auth, server-side)
- Account hub at `/dashboard/settings` (Profile, Password, Email, Notifications, Connected Accounts,
  Sessions, Danger Zone); change-email, delete-user, account linking

## Phase 2 — Course authoring ✅

- Course CRUD (title, description, thumbnail, preview video, pricing)
- Section/lesson management; drag-and-drop curriculum reordering; publish / unpublish
- Vercel Blob uploads (images ≤ 2 MB, video ≤ 100 MB)
- Instructor course preview

## Phase 3 — AI course builder ✅

- Multi-step AI chat guides course creation (`basic → objectives → requirements → curriculum`)
- **LangGraph `StateGraph`** + OpenAI `gpt-4o-mini` via streaming SSE (ADR-016)
- Intent classification, confidence scoring + auto-advance, revision flow, tool calls
- Draft state persisted to `CourseGeneration` / `CourseGenerationMessage`; live preview panel
- Spec: [`features/ai-course-builder/spec.md`](features/ai-course-builder/spec.md)

## Phase 4 — Student learning experience ✅

- Enrolled-courses dashboard with live progress; "Continue Learning" → next incomplete lesson
- Lesson view: video player, rich content, resources; mark complete/incomplete; section/lesson tree
- Per-skill progress (`skill` router + UI) — [`features/skill-progress/spec.md`](features/skill-progress/spec.md)
- Student progress page & dashboard stats (real data)

## Phase 5 — Enrollment ✅ · Payments ✅ · Billing ✅

- Free enrollment + re-activation; paid enrollment via Stripe Checkout, webhook reconciliation
- Instructor payouts (Stripe Connect), platform revenue admin surface (`app/(admin)/admin`, `ADMIN`-gated)
- Student billing / invoices — [`features/billing/spec.md`](features/billing/spec.md); ADR-019,
  [`features/payments/spec.md`](features/payments/spec.md)

## Phase 6 — Quizzes ✅

- Instructor multiple-choice quizzes per lesson; student takes quiz with immediate feedback
- One attempt per student per question (`QuizAttempt`, `AlreadyAttemptedError`)
- > Deferred: configurable retake policy, per-question analytics, more question types — **Next up → P1.7**

## Phase 7 — Discovery ✅ · Reviews & ratings ✅

- **Semantic search & recommendations** — pgvector cosine similarity (ADR-012); `search.semantic` +
  `search.recommendations`; "Recommended for you" rail; category/level filters —
  [`features/semantic-search-recommendations/spec.md`](features/semantic-search-recommendations/spec.md)
- **Reviews & ratings** — eligibility-gated student submit (`review.create`), aggregated
  `averageRating`/`reviewsCount`, course-card/detail display, instructor reviews dashboard + new-review
  badge

## Phase 8 — AI learning assistant ✅

- Per-lesson AI tutor for enrolled students (`app/api/chat/lesson/route.ts`, SSE)
- ReAct agent with tools (retrieve lesson context, search across course, progress, mark concept) +
  off-topic guardrail; history persisted

## Phase 9 — AI quiz generation ✅

- **Generate with AI** in the lesson quiz tab; `QuizAIService` agent with read-only tools; 3–5
  structured questions via `withStructuredOutput`, semantic validation + retries; review-before-save

## Phase 10 — Personalized learning path ✅

- AI analyses progress + quiz scores, identifies weak concepts (`ConceptMastery`); `learningPath`
  graph generates a cached, stale-checked study plan

## Phase A — Lesson auto-summary & insights ✅

- AI per-lesson summary, key concepts, glossary (`lessonInsightsAI`, `LessonInsights`); content-hash
  change detection

## Phase B — Lifecycle email & automations ✅

- Transactional email via **Resend + React Email** (ADR-015); **n8n** automations (certificate earned,
  near-completion, inactivity) with dedup (ADR-014); per-user opt-out honored

## Phase C — Certificates of completion ✅

- On-completion PDF certificate (`@react-pdf/renderer`), JWT-gated download; certificate email via n8n —
  [`features/certificates/spec.md`](features/certificates/spec.md)
- > Follow-up: persisted certificate records + public verification — **Next up → P1.8**

## Phase E — Instructor analytics & dashboards ✅

- Real (non-mock) instructor dashboard + student-management data: enrollment/completion trends, lesson
  dropout funnel, per-course stats, revenue summary / by-course / time-series — `analytics` router
- Instructor course search/filters + card stats

## Phase F — Messaging ✅

- 1:1 instructor ↔ student messaging per course (inbox / thread / composer), "Send Message" from the
  students table, polling-based updates — [`features/messages/spec.md`](features/messages/spec.md)

## Phase G — Engagement: achievements & in-app notifications ✅

- **Achievements** — 19 tiered badges (courses, lessons, **streaks**, study days, hours, quizzes,
  reviews) — [`features/achievements/spec.md`](features/achievements/spec.md)
- **In-app notifications** — dashboard-header notifications dropdown (`Dashboard/Header/components/Notifications`)
  complementing email + n8n

## Phase H — Mobile / responsive ✅

- Responsive student + marketing shell: hamburger drawer, collapsible persisted sidebar, `Sheet`
  primitive, `useIsMobile` — [`features/mobile-responsive/spec.md`](features/mobile-responsive/spec.md)
- Instructor portal mobile pass incl. responsive revenue charts —
  [`features/instructor-mobile/spec.md`](features/instructor-mobile/spec.md)

## Phase I — AI input trust boundary ✅

- Shared `aiGuard` module across all five AI services: L1 deterministic injection detection (no model
  call), L2 domain-parameterized topic relevance, L3 `<untrusted_data>` wrapping of database-sourced
  content; replaces `lessonAI`'s standalone topic guard. Entry-point contract test fails CI on a new
  unguarded AI surface (ADR-022) —
  [`features/ai-input-trust-boundary/spec.md`](features/ai-input-trust-boundary/spec.md)
## Phase J — AI flow contracts ✅

- Node-by-node contract for both LangGraph flows (11 `courseAI` nodes + 6 route predicates, 7
  `learningPathAI` nodes + `decideStrategy`): purpose/reads/writes/fails JSDoc at each node, a
  contract document with a flow diagram and a five-scenario failure matrix, and a contract test that
  fails CI when a node is added without documentation —
  [`features/ai-flow-contracts/spec.md`](features/ai-flow-contracts/spec.md)
- `courseAI` node failures are typed `RetryableNodeError` / `FatalNodeError` by error shape, logged
  with the node name and kind, and surfaced to the instructor as retryable or not — the precondition
  for failure-rate metrics
- Remaining hardening workstreams (observability, spec-process polish) are tracked in
  [`ai-hardening-plan.md`](ai-hardening-plan.md)

---

# Next up

Forward-looking work, ranked by business value vs. effort. **Value:** High / Med / Low · **Effort:**
S / M / L. Items marked 🤖 are AI features that reuse existing AI infrastructure. Backlog grounded in a
2026-06-28 codebase ideation pass (two agents); overlapping suggestions consolidated.

## P1 — Near-term: high value, fills a real gap

### P1.1 — Instructor insights & at-risk alerts 🤖 — *High · M*
Consolidates the stubbed "instructor insights agent" with at-risk detection. Flag disengaging students
(no login > 7d, low quiz completion, < 50% progress), surface the cohort's hardest concepts and
lessons that need revision, with LLM natural-language summaries + a re-engagement nudge. Reuses
`analytics` service, `ConceptMastery`, `QuizAttempt`, `notifications` (n8n).

### P1.2 — Admin user & role management — *Med-High · M*
The `app/(admin)/admin` page covers platform revenue + payout sweep only; user/role management UI is
still missing (roles assigned by manual DB edits). Add user list/search, role change, and course
moderation/reinstatement on the existing `adminProcedure`.

### P1.3 — Certificate records & public verification — *Med · S-M*
Certificates generate on demand but persist no record and have no public verify route. Add a
`Certificate` model + public `/verify/[code]` page + bulk export.

### P1.4 — Quiz enhancements — *Med · M*
Configurable retake policy, per-question analytics (feeds instructor dashboard), more question types
(true/false, multi-select).

## P2 — AI learning-loop (reuses existing AI infra)

Close the detect→act loop the platform half-implements (it detects weak concepts but doesn't fully act
on them). All reuse existing embeddings / insight-chain / `quizAI` infrastructure.

- **Misconception extractor** 🤖 — add a parallel chain to `lessonInsightsAI`; tutor proactively
  addresses top misconceptions — *High · S*
- **Targeted practice tests / mastery quizzes** 🤖 — `quizAI` generates focused drills on each student's
  weak `ConceptMastery` concepts (one endpoint powers tests, daily challenges, and review) — *High · M*
- **Spaced-repetition review engine** 🤖 — schedule lesson/quiz reviews from `ConceptMastery` +
  `LessonProgress` timestamps (forgetting curve); surfaces due-for-review content — *High · M*
- **Gamified daily challenges** 🤖 — daily 3–5 question micro-quiz from weak concepts, feeds the
  existing streak/quiz badges + notifications — *Med-High · M*
- **Prerequisite auto-detector** 🤖 — when a student struggles, surface prior lessons to review via
  `LessonChunkEmbedding` search — *Med · M*

## P3 — Engagement & content tooling

- **Instructor announcements / broadcast** — messaging is 1:1 only; add audience-scoped broadcast to all
  enrolled students (extend `Message`/`Conversation`; LLM can draft copy) — *Med · M*
- **Advanced search filters** (price, rating, instructor, language) on top of semantic search — *Med · S-M*
- **Lesson drip scheduling / draft workflow** — `Lesson.status` (draft/scheduled/published) +
  `scheduledPublishAt` + batch auto-publish; staggered release improves retention — *Med · S-M*
- **Adaptive lesson difficulty hints** — rule-based next-lesson difficulty from quiz performance +
  `ConceptMastery` (no LLM) — *Med · S*
- **Learning-streak notifications** — contextual nudge when a student is on a streak; reuses badge +
  notification infra — *Med · S*
- **Lesson rich-text WYSIWYG editor** — *Med · M* ⬜
- **AI course health audit** 🤖 — periodic LLM report on course completeness, stale resources, weak
  lessons (reuses `lessonInsightsAI` pattern) — *Med · M*
- **Course versioning / change history** — *Low · L*

## P4 — Monetization

- **Coupons / discount codes** — extend `Payment` (ADR-019) — *Med · S-M*
- **Course bundles** — `CourseBundle` + bundled checkout; instructors often have course series — *Med · M*
- **Referral program** — instructor/student referral links earn commission; extend `Payment` +
  Connect payout logic — *High · M*
- **Subscriptions / installment plans** (recurring or split billing) — *Med · L* (complex tier → ADR)
- **Tax / 1099 reporting** — annual earning summaries + 1099-ready export for instructors — *Med · M*

## P5 — Community & instructor brand (bigger bets)

- **Discussion / Q&A per course** (AI-assisted) — the main community gap; semantic dedup of questions
  via `LessonChunkEmbedding`, priority-flag for instructors — *Med-High · M-L*
- **Instructor public profile / portfolio** — public showcase (courses, reviews, bio) on
  `InstructorProfile`; drives trust + SEO — *Med-High · M*
- **Office hours & booking** — calendar slots students book; upsell lever — *Med-High · L*
- **Cohort / team enrollments** — group enrollment + shared deadlines + group announcements — *Med · L*
- **Peer-tutoring matchmaker** — match a struggling student to a peer who mastered the concept
  (`ConceptMastery` level 3 + messaging) — *Med · M*

---

## Not yet scheduled

- Native mobile app · Live sessions / webinars · Multi-language / i18n

---

## Recommended next 3 (from the ideation pass)

1. **P2 · Misconception extractor** (High · S) — best AI ROI for the effort; pure-additive chain.
2. **P1.1 · Instructor insights & at-risk alerts** (High · M) — turns existing analytics into proactive
   intervention; both ideation agents independently ranked at-risk detection #1.
3. **P2 · Targeted practice tests** (High · M) — one endpoint seeds tests, daily challenges, and the
   spaced-repetition engine; natural `/epic` candidate for the whole adaptive-practice cluster.