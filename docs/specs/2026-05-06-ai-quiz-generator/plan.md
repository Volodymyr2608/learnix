# Plan: AI Quiz Generator

Six task groups. Each ends with `pnpm typecheck && pnpm check` green before moving on. Groups 1–4 are non-AI infrastructure; group 5 is the LangChain piece; group 6 is the dialog that ties it together.

See [requirements.md](./requirements.md) for scope and decisions; [validation.md](./validation.md) for end-to-end verification.

---

## Group 1 — Quiz repository & service

**Files**
- `server/repositories/quiz.repository.ts` — extends `BaseRepository<Quiz>`; helpers: `findByLesson(lessonId)`, `replaceForLesson(lessonId, questions[], tx)`, `attemptByStudent(quizId, studentId)`.
- `server/services/quiz/quiz.service.ts` — `getByLesson`, `submit`, `upsertMany`, `deleteByLesson`. Verifies course ownership / enrollment before each operation.
- `server/services/quiz/quiz.errors.ts` — `QuizNotFoundError`, `QuizForbiddenError`, `AlreadyAttemptedError`.

**Acceptance**
- Repository compiles and reuses `BaseRepository` transaction helper for `replaceForLesson`.
- Service throws typed errors that map cleanly through the existing tRPC error formatter (see ADR-010).

**Run before moving on**: `pnpm typecheck && pnpm check`.

---

## Group 2 — Quiz tRPC router

**Files**
- `server/api/routers/quiz.ts` — procedures:
  - `getByLesson` — `studentProcedure`, enrollment check.
  - `submit` — `studentProcedure`, persists `QuizAttempt`, blocks resubmit.
  - `upsertMany` — `instructorProcedure`, replaces quiz set in a transaction.
  - `deleteByLesson` — `instructorProcedure`.
- `server/api/root.ts` — register the new router.

**Acceptance**
- `api.quiz.getByLesson.useQuery({ lessonId })` is callable from a Client Component with full type safety.
- Procedure roles match the matrix in `requirements.md` (F7).

**Run before moving on**: `pnpm typecheck && pnpm check`.

---

## Group 3 — Student quiz player UI

**Files**
- `app/_components/Quiz/QuizPlayer/QuizPlayer.tsx` — list of questions; one selectable answer per question; per-question Submit; correct/incorrect badge; resubmit blocked client-side based on `quiz.getByLesson` response.
- `app/_components/Quiz/QuizPlayer/QuestionCard.tsx`
- `app/dashboard/courses/[courseId]/learn/page.tsx` — render `<QuizPlayer lessonId={...} />` after the lesson content / video block.

**Acceptance**
- Player renders for an enrolled student with at least one quiz on the lesson.
- Submitting a question creates a `QuizAttempt` row (verify in Prisma Studio) and updates the badge without a page reload.

**Run before moving on**: `pnpm typecheck && pnpm check`.

---

## Group 4 — Instructor manual quiz CRUD UI

**Decision**: The lesson editor already had a fully-functional Quiz tab (`LessonContentEditor/components/QuizTab.tsx`) with add/edit/delete wired through `api.lesson.updateContent`. A separate `QuizEditor` component would duplicate this. Group 4 only adds the **Generate with AI** button to the existing tab.

**Files**
- `app/_components/Course/components/Lesson/LessonContentEditor/components/QuizTab.tsx` — add disabled **Generate with AI** button (handler stubbed; wired in group 6).
- `server/services/quiz/quiz.service.ts` — add `getByLessonForInstructor` (needed by group 6 generate dialog).
- `server/api/routers/quiz.ts` — add `getByLessonInstructor` instructorProcedure (needed by group 6).

**Acceptance**
- Generate button is rendered in the Quiz tab header and disabled with a tooltip explaining wiring lands in group 6.

**Run before moving on**: `pnpm typecheck && pnpm check`.

---

## Group 5 — AI piece: tools, agent, chain

**Setup**
- `pnpm add @langchain/langgraph`

**Files**
- `server/services/quizAI/schemas/quizOutput.schema.ts` — `QuizQuestionSchema` (`question: string`, `options: string[].length(4)`, `correct: string`), `QuizOutputSchema` (`questions: QuizQuestionSchema[].min(3).max(5)`).
- `server/services/quizAI/tools/getLessonContent.tool.ts` — `tool()` named `get_lesson_content`, schema `{ lessonId: string }`, returns `Title: ...\n\n<content>` or sentinel `"No text content found for this lesson."`.
- `server/services/quizAI/tools/getExistingQuizzes.tool.ts` — `tool()` named `get_existing_quizzes`, schema `{ lessonId: string }`, returns one `- <question>` per line or sentinel `"No existing questions for this lesson."`.
- `server/services/quizAI/quizAI.agent.ts` — `createQuizAgent(lessonId, level, count)` factory: `ChatOpenAI({ model: "gpt-4o-mini", temperature: 0.3 }).withStructuredOutput(QuizOutputSchema)`, `createReactAgent({ llm, tools, prompt })`. Prompt is a `ChatPromptTemplate` with the system rules from the existing high-level spec.
- `server/services/quizAI/quizAI.service.ts` — `QuizAIService.generateForLesson(lessonId, level, count)`:
  - `RunnableSequence.from([packageInputs, agent, extractQuestions])`.
  - `runWithRetry(chain, input, maxAttempts = 3)`: on parse error or `validateSemantics` failure, feed the error back into the next attempt's input as a `hint` field, log a `warn`.
  - `validateSemantics(questions)`: returns the first violation message or `null`.
  - On success: returns `QuizQuestion[]`.
  - On 3 failures: throws `MaxRetriesExceededError`.
- `server/services/quizAI/quizAI.errors.ts` — `QuizAIError`, `MaxRetriesExceededError`, `LessonHasNoContentError`.
- `server/api/routers/quiz.ts` — add `generateAI` mutation (`instructorProcedure`, `{ lessonId, count?: 3..5 }`). Loads lesson, throws `LessonHasNoContentError` (mapped to `BAD_REQUEST`) if `content` is empty, otherwise calls the service and returns `QuizQuestion[]`.

**Acceptance**
- `api.quiz.generateAI.useMutation()` returns a typed `QuizQuestion[]`.
- Server log shows the `RunnableSequence` running and tool calls being dispatched.
- Schema and semantic violations both trigger a single retry on the first attempt and succeed on the second (verify by temporarily forcing one).

**Run before moving on**: `pnpm typecheck && pnpm check`.

---

## Group 6 — Generate-with-AI dialog

**Files**
- `app/_components/Quiz/QuizEditor/GenerateQuizDialog.tsx`:
  - Trigger: the Generate button in `QuizEditor` (wire up; remove the disabled stub from group 4).
  - On open: fires `quiz.generateAI` mutation, shows a spinner with "Reading lesson and writing questions…".
  - On success: renders the `QuizQuestion[]` in a list with inline edit on every field.
  - **Save all** button calls `quiz.upsertMany`; on success, closes the dialog and invalidates the `quiz.getByLesson` query so `QuizEditor` re-renders with the new set.
  - **Regenerate** button re-runs the mutation.
  - Error toast on `BAD_REQUEST` ("Lesson has no content to generate quiz from") and `INTERNAL_SERVER_ERROR` ("Generation failed, try again").

**Acceptance**
- Full happy path runs end-to-end: open editor → Generate → review → edit → Save → see the saved quiz reflected in `QuizEditor` and in the student player.
- Empty-lesson case shows the friendly toast and does not write to the DB.

**Run before moving on**: `pnpm typecheck && pnpm check && pnpm build`.

---

## Final wrap-up

1. Run all checks in [validation.md](./validation.md) (automated + 7 manual scenarios).
2. Open a PR following the repo's existing PR style (`feat: AI quiz generator (phase 9)`).
3. Link the PR back to this spec triplet in the description.