# Requirements: AI Quiz Generator

## Why

Instructors author quiz questions by hand today. The `Quiz` and `QuizAttempt` Prisma models exist, but there is no router, no service, no UI, and no AI generation path. This is the first feature to follow the new `LCEL chain → ReAct agent → tools` pattern mandated by [ADR-008](../../adr/008-langchain-agent-pattern.md). Shipping it does two things at once:

1. Removes the blank-page problem for instructors (mission: "make creating education dramatically easier through AI").
2. Proves out the agent pattern in production so [Phase 8 — AI Lesson Assistant](../ai-lesson-assistant.md) can build on the same primitives.

## Users & primary flow

**Instructor.**
1. Opens a lesson editor at `app/instructor/courses/[courseId]/lessons/[lessonId]/page.tsx`.
2. Sees the existing quiz questions (manual CRUD list) and a **Generate with AI** button.
3. Clicks Generate → spinner ~4–10s → review dialog opens with 3–5 generated multiple-choice questions.
4. Optionally edits any question, option, or correct answer inline.
5. Clicks **Save all** → the lesson's quiz set is replaced atomically.

**Student.**
1. Opens a lesson at `app/dashboard/courses/[courseId]/learn/page.tsx`.
2. After the lesson content, sees the quiz player.
3. Selects an answer per question, submits, sees correct/incorrect immediately.
4. Cannot resubmit a question they have already attempted.

## Functional requirements

| # | Requirement |
|---|---|
| F1 | Instructor can generate 3–5 multiple-choice questions from one lesson with one click. |
| F2 | Each generated question has exactly 4 options and `correct ∈ options`. |
| F3 | Generation must not duplicate questions already saved on the same lesson. |
| F4 | Instructor can edit the question text, any option, and the correct option in the review dialog before saving. |
| F5 | Saving replaces the lesson's full quiz set in a single transaction (no partial state). |
| F6 | Student can answer each question once per `QuizAttempt`, sees immediate correct/incorrect feedback, and is blocked from resubmitting. |
| F7 | Quiz player and `quiz.submit` are gated by enrollment; `quiz.upsertMany`, `quiz.deleteByLesson`, and `quiz.generateAI` are gated by ownership of the parent course. |

## Non-functional requirements

- Generation completes in **< 10s** for a typical lesson (~2k tokens of `content`).
- Model is `gpt-4o-mini` only — same as the existing course builder; no new provider dependency.
- English only — prompts are not translated.
- The only data sent to OpenAI is the lesson's `title` and `content`. No student PII, no instructor PII.
- All AI calls go through the existing `OPENAI_API_KEY` env var consumed inside the service (matches `CourseAIService`; not added to `lib/env.js`).

## Architecture decisions

| Decision | Rationale |
|---|---|
| LCEL `RunnableSequence` over plain async/await orchestration | ADR-008 rule 5; named, composable, replayable steps. |
| `createReactAgent` from `@langchain/langgraph` over a hand-rolled loop | ADR-008 rule for reasoning features; battle-tested loop; reused by the Phase 8 lesson assistant. |
| `model.withStructuredOutput(QuizOutputSchema)` over `JSON.parse` | ADR-008 rule 2; one call, typed result, no parse failures. |
| Semantic-validate-then-retry (max 3) over single-shot | ADR-008 rule 3; the schema can guarantee shape but not `correct ∈ options`; bounded so a stuck agent fails loudly. |
| tRPC mutation + spinner over SSE | Generation is short (<10s) and the result is structured, not narrative. SSE adds endpoint, hook, and event protocol with no UX win here. |
| Two read-only tools (`get_lesson_content`, `get_existing_quizzes`) over context-stuffing | ADR-008 rule 1; tools fetch on demand instead of always paying the token cost. |

## Out of scope

- SSE streaming of agent reasoning to the client.
- Input guardrail chain — instructors are trusted; their input is not free-form anyway (the request is a button click with `lessonId` and `count`).
- True/false, fill-in-the-blank, or open-ended question types — MCQ-only matches the existing `Quiz` schema.
- Instructor-facing quiz analytics (attempt counts, % correct).
- Configurable per-quiz retake policy — the existing schema does not model this; deferred to its own feature.
- Translation / multi-language support.

## Dependencies & assumptions

- `Quiz` and `QuizAttempt` Prisma models already exist in `prisma/schema/quiz.prisma` (verified). No schema migration is expected.
- `lesson.content` is the source of truth for what the agent reads. Lessons with `content = null` cannot be used for generation and must surface a friendly error.
- `OPENAI_API_KEY` is set in the deployment environment.
- The new dep `@langchain/langgraph` will be added; `@langchain/core` and `@langchain/openai` are already installed.
- `BaseRepository` (`server/repositories/base/base.repository.ts`) handles CRUD, soft-delete, pagination, and transactions — `quiz.repository.ts` extends it.
- Three-layer pattern from `CLAUDE.md`: router → service → repository. AI orchestration lives in its own `quizAI` service so the regular `quiz` service stays free of LangChain.

## Reference docs

- [Mission](../mission.md)
- [Tech stack](../tech-stack.md)
- [Existing high-level spec for this feature](../ai-quiz-generator.md)
- [ADR-008 — LangChain agent + tools pattern](../../adr/008-langchain-agent-pattern.md)
- [ADR-006 — SSE for AI course builder](../../adr/006-sse-ai-course-builder.md) (intentionally not followed here; see decisions table)
- [ADR-010 — Domain error mapping](../../adr/010-domain-error-mapping.md)
