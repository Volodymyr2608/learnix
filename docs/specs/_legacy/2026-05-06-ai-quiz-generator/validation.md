# Validation: AI Quiz Generator

How to know the implementation in [plan.md](./plan.md) succeeded and the branch is mergeable.

---

## Automated checks

All must pass on the feature branch before opening a PR.

| Command | Expectation |
|---|---|
| `pnpm typecheck` | No errors. |
| `pnpm check` | No lint or format issues (Biome). |
| `pnpm build` | Production build succeeds. |
| `pnpm db:generate` | No new migration generated (no schema changes expected — `Quiz` and `QuizAttempt` already exist). |
| `pnpm generate` | Prisma client regenerates cleanly. |

---

## Manual scenarios

Run the dev server (`pnpm dev`) and Prisma Studio (`pnpm db:studio`) side by side. Each scenario assumes a clean session — log out and log in as the role indicated.

### S1 — Happy path

**Setup**: an INSTRUCTOR account with at least one published course; one lesson on that course with `content` ≥ 200 words.

1. Sign in as the INSTRUCTOR.
2. Navigate to the lesson editor.
3. Click **Generate with AI**.
4. **Expect**: spinner appears; review dialog opens within 10s with 3–5 questions.
5. **Verify**: every question has exactly 4 options; the correct option appears in the options list (no orphans).
6. Edit one option's text, click **Save all**.
7. **Verify**: dialog closes; `QuizEditor` shows the new question set; in Prisma Studio, the `quizzes` table for the lesson contains exactly the saved questions (old questions, if any, are gone).

### S2 — Empty lesson

**Setup**: a lesson with `content = null`.

1. As the INSTRUCTOR, click **Generate with AI** on that lesson.
2. **Expect**: an error toast: "Lesson has no content to generate quiz from."
3. **Verify**: no `quizzes` rows were created or modified for this lesson.
4. **Verify** server log shows a single `BAD_REQUEST` from `quiz.generateAI`, no LangChain agent invocation.

### S3 — Existing quizzes (no duplicates)

**Setup**: pre-seed 5 questions on a lesson manually (via `QuizEditor`).

1. Click **Generate with AI** on that lesson.
2. **Verify** in the server log that the agent called `get_existing_quizzes` and that the tool returned the 5 seeded question texts.
3. **Verify** the generated questions are not paraphrases of the seeded ones (judgment call; if they are, retry once and inspect the prompt).

### S4 — Semantic-violation retry

**Setup**: temporarily wrap the agent's structured output to force one bad result on the first call (e.g., set the first question's `correct` to a string not in `options`). Set `logger` level to `info`.

1. Click **Generate with AI**.
2. **Verify** the server log shows exactly one `warn` line: `Quiz generation attempt 1/3 failed: Question "..." has correct="..." which is not in options`.
3. **Verify** the second attempt succeeds and the dialog opens with valid questions.
4. **Revert** the test wrapper.

### S5 — Max retries exceeded

**Setup**: same as S4 but force a violation on every attempt.

1. Click **Generate with AI**.
2. **Verify** three `warn` lines for attempts 1, 2, 3.
3. **Verify** an error toast appears: "Generation failed, try again."
4. **Verify** the response is `INTERNAL_SERVER_ERROR` (browser network tab) carrying `MaxRetriesExceededError`.
5. **Revert** the test wrapper.

### S6 — Auth gates

| Action | Role | Expected |
|---|---|---|
| Call `quiz.generateAI` | STUDENT | `UNAUTHORIZED` (procedure is `instructorProcedure`) |
| Call `quiz.upsertMany` for a course not owned | INSTRUCTOR (other) | `FORBIDDEN` from service ownership check |
| Call `quiz.submit` for a lesson the user is not enrolled in | STUDENT | `FORBIDDEN` |
| Call `quiz.getByLesson` for a lesson the user is not enrolled in | STUDENT | `FORBIDDEN` |
| Call any quiz procedure with no session | anonymous | `UNAUTHORIZED` |

Use the browser network tab or `curl` to issue the calls.

### S7 — Student flow

**Setup**: complete S1, then enroll a STUDENT account in the course.

1. Sign in as the STUDENT.
2. Open the lesson.
3. **Verify** the `QuizPlayer` renders the saved questions.
4. Submit each question (mix of correct and incorrect choices).
5. **Verify** each Submit produces a correct/incorrect badge without a page reload.
6. **Verify** in Prisma Studio that one `QuizAttempt` row per question was created with the right `selectedAnswer` and `isCorrect`.
7. **Verify** the Submit button on each question is disabled after submission and reload still shows it disabled.

---

## Code review checklist

Before requesting review:

- [ ] Three-layer pattern respected: every new tRPC procedure delegates to a service; every service uses a repository (no direct Prisma in routers/services).
- [ ] Every tool has a Zod `schema` and a `description` explaining when to call it.
- [ ] No `JSON.parse` on any model response (ADR-008 rule 2).
- [ ] `withStructuredOutput` is the only path to typed agent output.
- [ ] LCEL chain composes named functions, not nested closures.
- [ ] Retry loop is bounded (`maxAttempts = 3`), logs warn lines, throws on exhaustion.
- [ ] Domain errors (`QuizAIError`, `MaxRetriesExceededError`, `LessonHasNoContentError`, `QuizForbiddenError`, `AlreadyAttemptedError`) all live in `*.errors.ts` and are mapped through the existing tRPC error formatter (ADR-010).
- [ ] No `OPENAI_API_KEY` reference outside `quizAI.service.ts` / `quizAI.agent.ts`; matches the existing `CourseAIService` convention of consuming the key directly.
- [ ] Follow Biome's sorted classes and import order — no manual class lists out of order.
- [ ] Procedure roles match `requirements.md` F7.

---

## Definition of done

- All six task groups in [plan.md](./plan.md) are complete.
- All automated checks above pass.
- All seven manual scenarios pass.
- Code review checklist signed off.
- PR opened against `main`, linked back to this spec triplet, and merged after review.