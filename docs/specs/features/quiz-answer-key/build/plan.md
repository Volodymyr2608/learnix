# Quiz Answer Key — Implementation Plan

> **For agentic workers:** execute with `superpowers:executing-plans` in this session — the warm
> context is the cheapest place to run TDD loops (ADR-030). Dispatch a subagent only for work that
> *reads a lot and returns little*; reconnaissance goes to `Explore`, never `general-purpose`.
> Steps use checkbox (`- [ ]`) syntax. See [`../spec.md`](../spec.md) for the design and Acceptance
> criteria, and [`../security.md`](../security.md) for the controls each task must satisfy.

**Goal:** Make level-3 mastery mean something — remove the answer key from every student-reachable
response, and bound guessing so removing it is not merely an inconvenience.

**Architecture:** Two halves that are only sound together (`security.md` S2). The key is narrowed at
the **repository** (`select` field list), never at the caller, so it is never loaded and cannot be
spread, logged or re-exposed. Guessing is bounded by persisted attempt data — a per-quiz cap of
`min(3, options.length − 1)` and a 24-hour cooldown derived from the attempt row, not from
in-process state. The level-3 write path gains the validation the level-2 path already had.

**Track:** `guarded` / complex tier. `pnpm classify` currently reports
`STANDARD-OR-DIRECT — no new authority and no control touched`, but that reads a working tree holding
only documentation edits; the classifier cannot see a change that has not been written. The feature
adds two schema columns, a unique constraint and a migration, and narrows a projection that is itself
a control — **new authority under `documentation-process.md` §3a**. The design-mode threat pass is
already on record (`security.md`, two agent passes, 2026-08-18), so every S-control below has its own
task with its own test. An **ADR is required at `/qa`**.

**Order is deliberate: the cap ships before the projection.** If work stops midway, the safe partial
state is "key still visible, guessing bounded" — not "key hidden, guessing free", which is the
enumeration regression `security.md` S2 exists to prevent. AC 12 is only true once both halves land,
and the branch merges as one module.

**Codebase anchors (verified during planning):**

- `QuizRepository.findByLesson` (`server/repositories/quiz.repository.ts:16-21`) — `findMany({ where: { lessonId, deletedAt: null }, orderBy: { id: "asc" } })`, **no `select`**; the single place AC 4 narrows. Its three callers all inherit the narrowing.
- `BaseRepository.findOne` (`server/repositories/base/base.repository.ts:100-127`) — `findUniqueOrThrow`, full row. This is the grading path (`quiz.service.ts:100`) and must keep `correct`.
- `quizService.getByLesson` (`server/services/quiz/quiz.service.ts:70-96`) — pairs `quizzes[i]` with `attempts[i]` **positionally** (lines 82-85), which is why `orderBy: { id: "asc" }` is load-bearing.
- `quizService.submit` (`quiz.service.ts:98-179`) — read-then-write via `findByQuizAndStudent` (104-107), `AlreadyAttemptedError` on an existing correct row (109-114), grading at line 116, **wrong attempt overwrites its own row** (118-128), promotion awaited but its failure swallowed (138-144).
- `promoteConceptsIfLessonComplete` (`quiz.service.ts:181-221`) — early-returns on `correctCount < quizzes.length` (188-192), reads `insights.concepts` as unschema'd JSON with one `typeof` filter (201-209), writes the literal `3` (211-220).
- `quizAttemptRepository` (`server/repositories/quizAttempt.repository.ts`) — `countDistinctCorrectAmong` uses `distinct: ["quizId"]` (33-43); the file's own comment (25-31) records that **no unique constraint on `(quizId, studentId)` exists** and concurrent submits can leave two correct rows.
- `lessonService.getStudentLesson` (`server/services/lesson/lesson.service.ts:113-159`) — `include: { quizzes: { … } }` with no field select, and `return lesson as typeof lesson & { quizzes: Quiz[] }` at line 149. `fetchVerified` (35-54) carries the identical shape and cast for the **instructor** audience — the split AC 8 of `security.md` S3 wants is between these two.
- `quizRouter` (`server/api/routers/quiz.ts`) — `getByLesson` (18-26) and `submit` (28-40) are `studentProcedure` with **no** rate-limit middleware; `generateAI` (66-80) is the only one carrying `aiRateLimit`.
- `checkAiRateLimit` (`server/services/_shared/aiLimits/checkAiRateLimit.ts:78-100`) — keyed by `AiRateLimitFeature`, fixed `WINDOW_MS = 60_000` (line 13). Key composition at 55-57. **There is no non-AI per-resource limiter in the repo** — `server/observability/throttle.ts` is a Sentry fingerprint throttle, not a request limiter. See Task 7.
- `RateLimitStore` port (`server/services/_shared/aiLimits/store/types.ts:10-34`) — `checkAndBump`, generic over `LimitWindow = { key, max }`; the 60-second window is the *caller's* constant, not the store's.
- `conceptMasteryRepository.upsertMastery` (`server/repositories/conceptMastery.repository.ts:18-44`) — the `$queryRaw` `ON CONFLICT … GREATEST` pattern to imitate for any raw upsert.
- `getExistingQuizzes.tool.ts:10,19` — calls `findByLesson` and maps **only** `q.question`; it inherits Task 8's narrowing automatically, so AC 20 is a pinning test, not a change.
- `AI_SURFACES` quizAI entry (`server/services/_shared/conformance/aiSurfaces.ts:132-153`), `exclusions` at 151-152. See Task 20 — this string does not say what AC 21 assumes.
- `logSecurityEvent` (`server/services/_shared/aiGuard/securityLog.ts:38-58`); `SecurityOutcome` union (`server/services/_shared/aiGuard/types.ts:72-86`); `SecuritySubject` includes `kind: "quiz"` (`types.ts:94-97`). Example call passing `subject`: `quizAI.service.ts:167-175`.
- Test scaffolding: `quiz.service.integration.test.ts:19-30` (`setup`), factories `makeQuiz` (`test/factories.ts:86-97`, default `options: ["A","B"], correct: "A"`), `makeQuizAttempt` (99-108), `makeLessonInsights` (110-127), `truncateAll` (`test/db.ts:40-43`).
- Migration patterns: `20260619183514_add_reviews_last_viewed_at` (add column + `UPDATE` backfill, commented) and `20260806185555_…_context_eligible` (add column with default, **no** backfill, comment explains why none is possible).

**Per-task conventions:** after the implementation step, `pnpm typecheck` and `pnpm check` must be
clean before committing. Unit tests are colocated `*.test.ts`; integration tests are
`*.integration.test.ts` against `learnix_test`. Services and repositories export singletons. No
`Co-Authored-By` trailer on commits.

---

## Four findings from planning — all four now corrected in `spec.md`

Raised here rather than discovered at `/qa`, and folded back into the spec on 2026-08-27 so the two
documents do not disagree. Kept in the plan because each one changes how a task's **test** must be
written, which is not visible from the criterion alone.

**1. AC 7's wording overstates what the cap buys, and a literal test of it flakes.** AC 7 says a
client "submitting each option in turn cannot obtain `isCorrect: true`". With four options the cap is
`min(3, 3) = 3`, so three of the four options can be tried — a random enumeration succeeds **3 times
in 4**. What the cap makes impossible is *exhaustive* enumeration, which is what `security.md` S10
residual 3 actually claims ("makes systematic enumeration impossible, not luck"). Task 3's test must
therefore seed the fixture so the correct option is the one the cap denies; a fixture that lets the
correct answer fall inside the first three attempts fails 75 % of runs. **AC 7 now says so** — the
guarantee is "cannot exhaust", not "cannot obtain", matching S10 residual 3.

**2. The cooldown has no clock to read.** `QuizAttempt` carries only `createdAt`, and `submit`
updates the row **in place** (`quiz.service.ts:118-124`), so `createdAt` stays pinned to the first
attempt forever. A 24-hour cooldown measured from cap exhaustion needs a timestamp that moves —
`security.md` S10 item 2 insists it be derived from persisted data, not in-process state, so this must
be a column. Task 1 adds `updatedAt DateTime @updatedAt`; **Functional scope 4 and AC 9 now name it.**

**3. AC 8's worked example is unreachable under AC 7's cap.** AC 8 illustrates the counter with
"three wrong submissions then one correct yields `{ attemptCount: 4, isCorrect: true }`". Under
`min(3, options.length − 1)` that needs `options.length ≥ 5`; on a four-option quiz the third wrong
answer exhausts the cap and the fourth submission is rejected, so the example describes a state the
feature makes unreachable. Worse for the tests: `makeQuiz`'s default is `options: ["A", "B"]`
(`test/factories.ts:86-97`), which caps at **one** attempt and makes every cap and cooldown fixture
degenerate. Every test in Tasks 2–4 must therefore set `options` explicitly. **AC 8 now states the
option count its example requires** and says the fixtures must be explicit.

**4. AC 21 does not follow from AC 19 and 20.** The code-level "C4 exception" is the `exclusions`
string at `aiSurfaces.ts:151-152`, and it says the answer key **is model-authored** — that a poisoned
lesson can steer which option is marked correct, and no layer checks it. AC 19 and 20 establish
something different: that no quiz field but `question` *reaches* a model or an embedding. Landing them
does not make the exclusion false, so dropping it would have the conformance matrix certify a
guarantee this feature does not deliver — the exact failure mode `security.md` S2 warns about, one
level up. Task 20 therefore **narrows** the exclusion rather than deleting it. **AC 21 now says
"narrows", with a table splitting the exception's two claims**; the model-authored half stays open and
keeps its tracking in `ai-defence-layers` S17.

---

## A. Attempt record and cap

## Task 1 — An attempt row records how many attempts it took, and there is one row per pair

- **Contract:** `QuizAttempt` carries `attemptCount Int?` (NULL = unknown, for rows that predate this
  change) and an `updatedAt` that moves on every graded attempt. `(quizId, studentId)` is unique.
- **Test:** `server/repositories/quizAttempt.repository.integration.test.ts` — pre-existing duplicate
  pairs collapse to one row keeping the `isCorrect` row (else the newest); every pre-existing row has
  `attemptCount IS NULL`; a second insert for a pair now raises.
- **Files:** `prisma/schema/quiz.prisma`, `prisma/migrations/<ts>_quiz_attempt_counter/migration.sql`
- **AC:** spec.md #8 · `security.md` D-F
- **`code included: a data migration whose dedupe is irreversible`** — the SQL goes in the plan review,
  not just the commit. Dedupe selection must be total and deterministic
  (`ORDER BY "isCorrect" DESC, "createdAt" DESC, id DESC`), archive first into
  `quiz_attempts_archive_dedupe`, and add **no** backfill for `attemptCount`.
- **Commit:** `feat(quiz): record attempt count and make (quiz, student) unique`

- [ ] Write the failing test · [ ] Run it, see it FAIL (no column, no constraint) · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

> **Do not backfill `attemptCount` from `count(*)` per pair.** The old code overwrites the attempt row
> in place, so `count(*)` is 1 for a quiz retried twenty times. It looks like a free, truthful backfill
> and it is a fabrication.

---

## Task 2 — Recording an attempt is one atomic statement

- **Contract:** `quizAttemptRepository.recordAttempt(quizId, studentId, selectedAnswer, isCorrect)`
  inserts or updates in a single statement, incrementing `attemptCount` (NULL stays NULL), and
  refuses to touch a row that is already correct. Zero rows returned means "already answered
  correctly" — and nothing else.
- **Test:** same integration file — first attempt yields `attemptCount = 1`; wrong-then-right yields
  2; a NULL-count legacy row answered again stays NULL; a submit against an already-correct row
  returns zero rows; two concurrent calls leave one row and one loser. **Fixtures set `options`
  explicitly** — `makeQuiz` defaults to two options, which caps at one attempt (finding 3).
- **Files:** `server/repositories/quizAttempt.repository.ts`
- **AC:** spec.md #8
- **Commit:** `feat(quiz): atomic attempt recording`

- [ ] Write the failing test · [ ] Run it, see it FAIL (method absent) · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

> The `ON CONFLICT … DO UPDATE` predicate must be qualified as `WHERE NOT quiz_attempts."isCorrect"`.
> `EXCLUDED."isCorrect"` is one token away and inverts the lock, letting a later wrong answer overwrite
> a correct one. Zero-rows is unambiguous **only** while this is the sole predicate — any future
> predicate needs its own distinguishable signal.

---

## Task 3 — Guessing is capped below the option count

- **Contract:** a quiz permits at most `min(3, options.length − 1)` graded attempts per student.
  Exceeding it throws a typed error, records no further attempt, and does not reveal `correct`.
- **Test:** `server/services/quiz/quiz.service.integration.test.ts` — with a fixture whose correct
  option is the one the cap denies, a client submitting options in turn never obtains
  `isCorrect: true` and `promoteConceptsIfLessonComplete` does not fire; the error is typed; a
  two-option quiz caps at 1.
- **Files:** `server/services/quiz/quiz.service.ts`, `server/services/quiz/quiz.errors.ts`
- **AC:** spec.md #7, #9 · `security.md` D-D, D-E
- **Commit:** `feat(quiz): cap graded attempts below the option count`

- [ ] Write the failing test · [ ] Run it, see it FAIL (unlimited retries today) · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

> See finding 1 above: the fixture's correct option must sit outside the cap, or the test passes
> 25 % of the time by luck.

---

## Task 4 — Exhausting the cap starts a 24-hour cooldown that then resets

- **Contract:** once the cap is exhausted the student may not attempt again for 24 hours, measured
  from the last attempt; afterwards the counter resets and attempts resume. Derived from the attempt
  row, so it survives a restart.
- **Test:** same integration file — an exhausted cap rejects; with `updatedAt` moved back 25 hours the
  student may attempt again and `attemptCount` restarts; at 23 hours it still rejects.
- **Files:** `server/services/quiz/quiz.service.ts`, `server/repositories/quizAttempt.repository.ts`
- **AC:** spec.md #9 · `security.md` S10 item 2
- **Commit:** `feat(quiz): 24h cooldown after cap exhaustion`

- [ ] Write the failing test · [ ] Run it, see it FAIL (no cooldown) · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 5 — Submitting never reveals the answer, and a retry inside the cap works normally

- **Contract:** `quiz.submit` returns `{ isCorrect, attempt }` with no `correct` on any path —
  wrong, right, capped or cooled down. A wrong answer inside the cap can be retried.
- **Test:** `quiz.service.integration.test.ts` plus a router-level assertion — the serialised response
  has no `correct` key on all four paths.
- **Files:** `server/services/quiz/quiz.service.ts`, `server/entities/quiz/index.ts`
- **AC:** spec.md #11 · `security.md` D-C
- **Commit:** `feat(quiz): never return the answer key from submit`

- [ ] Write the failing test · [ ] Run it, see it FAIL · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 6 — A soft-deleted quiz cannot be submitted

- **Contract:** `quiz.submit` rejects a quiz with `deletedAt` set, before grading.
- **Test:** `quiz.service.integration.test.ts` — submitting a soft-deleted quiz throws; the same quiz
  before deletion succeeds.
- **Files:** `server/services/quiz/quiz.service.ts`
- **AC:** spec.md #22
- **Commit:** `fix(quiz): reject submissions for soft-deleted quizzes`

- [ ] Write the failing test · [ ] Run it, see it FAIL (`findOne` ignores `deletedAt`) · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 7 — `quiz.submit` is rate-limited per student and quiz

- **Contract:** submissions beyond a per-`(userId, quizId)` window are rejected before reaching the
  repository.
- **Test:** `server/services/quiz/submitRateLimit.integration.test.ts` — the (n+1)th submission in the
  window is rejected and writes no attempt row; a different quiz for the same student is unaffected;
  the tutor's AI allowance is untouched.
- **Files:** `server/services/_shared/aiLimits/` (a non-AI window on the existing store),
  `server/api/routers/quiz.ts`
- **AC:** spec.md #10
- **Commit:** `feat(quiz): rate-limit submissions per student and quiz`

- [ ] Write the failing test · [ ] Run it, see it FAIL (no limiter) · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

> **This is the one task with no existing pattern to copy.** `checkAiRateLimit` is keyed by
> `AiRateLimitFeature` and hard-codes a 60-second window, so `quiz.submit` cannot use it as-is; the
> underlying `RateLimitStore` port is generic and can carry another window. Do **not** route this
> through an `AiFeature` — spending a student's tutor allowance on a non-AI call is the defect
> `ai-tutor-guardrails` S13 §17/§31 already records. The cap in Task 3 does the security work here;
> this task bounds request volume.

---

## B. The key leaves the student surface

## Task 8 — The repository never loads the answer key for a lesson read

- **Contract:** `quizRepository.findByLesson` selects `{ id, question, options, lessonId, deletedAt }`
  explicitly. `correct` is never loaded, so it cannot be spread, logged or re-exposed by a future
  caller. Ordering is unchanged.
- **Test:** `server/repositories/quiz.repository.integration.test.ts` — the returned object's own keys
  do not include `correct`; ordering is still `id asc`.
- **Files:** `server/repositories/quiz.repository.ts`
- **AC:** spec.md #4 · `security.md` D-B, S3
- **Commit:** `feat(quiz): narrow findByLesson to the student field set`

- [ ] Write the failing test · [ ] Run it, see it FAIL · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 9 — `quiz.getByLesson` returns no answer key, and still pairs attempts correctly

- **Contract:** the procedure's serialised response carries no `correct` at any depth, and each quiz
  still carries its own attempt.
- **Test:** `server/api/routers/quiz.integration.test.ts` — no `correct` in the superjson payload;
  pairing asserted against a lesson with ≥3 quizzes whose ids do **not** sort in creation order.
- **Files:** `server/services/quiz/quiz.service.ts`
- **AC:** spec.md #1, #15
- **Commit:** `feat(quiz): drop the answer key from getByLesson`

- [ ] Write the failing test · [ ] Run it, see it FAIL · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

> `orderBy: { id: "asc" }` is load-bearing — `getByLesson` pairs positionally
> (`quiz.service.ts:82-85`). A projection change that disturbs ordering shows a student someone
> else's attempt state.

---

## Task 10 — The student lesson read drops the key, and the type stops asserting it exists

- **Contract:** `lessonService.getStudentLesson` selects nested quiz fields explicitly and returns the
  inferred narrowed type; the `as typeof lesson & { quizzes: Quiz[] }` cast is gone. The instructor
  path (`fetchVerified` / `getLesson`) is unchanged and keeps `correct`.
- **Test:** `server/services/lesson/lesson.service.integration.test.ts` — no `correct` on any nested
  quiz for the student path; the instructor path still has it. Plus a type-level assertion that
  `quiz.correct` is not accessible on the student return type.
- **Files:** `server/services/lesson/lesson.service.ts`
- **AC:** spec.md #2, #5 · `security.md` S4
- **Commit:** `feat(lesson): narrow student lesson quizzes and drop the cast`

- [ ] Write the failing test · [ ] Run it, see it FAIL · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

> `security.md` S4 calls this cast "the most likely way this feature gets undone". Removing it is what
> turns a future reintroduction into a `pnpm typecheck` failure instead of a runtime `undefined`.

---

## Task 11 — Grading still reads the key, through a different door

- **Contract:** `quiz.submit` grades correctly after Tasks 8–10, via `findOne`; `findByLesson` is not
  called on the submit path.
- **Test:** `quiz.service.integration.test.ts` — a correct submission is still graded correct; a spy
  asserts `findByLesson` is not invoked during `submit`.
- **Files:** none expected — this is a pinning test
- **AC:** spec.md #6
- **Commit:** `test(quiz): pin that grading does not depend on the narrowed read`

- [ ] Write the failing test · [ ] Run it, see it PASS immediately (it pins existing behaviour;
  say so rather than pretending it failed) · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 12 — No student-reachable response contains the key, at any depth, from any procedure

- **Contract:** a contract test enumerates every `studentProcedure` in `server/api/root.ts`, invokes
  each against a seeded enrolled student with a lesson carrying quizzes, and deep-walks the
  serialised result for a key named `correct`.
- **Test:** `server/api/studentSurface.contract.integration.test.ts` — key presence at any depth, not
  a text search.
- **Files:** new test file only
- **AC:** spec.md #3 · `security.md` S5
- **Commit:** `test(quiz): enumerate the student surface for the answer key`

- [ ] Write the failing test · [ ] Run it, see it FAIL (before Tasks 8–10 land, or by temporarily
  reverting one) · [ ] Implement · [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check`
  clean · [ ] Commit

> Key presence, not text: `analytics.repository.ts` returns `{ attempts, correct: number }`, an
> aggregate sharing the *word*, which a grep would flag falsely; a future nested `include` is what a
> type check would miss.

---

## C. The level-3 write path

## Task 13 — The two mastery ceilings are named constants with a proven ordering

- **Contract:** `QUIZ_MASTERY_LEVEL` and `CONVERSATION_MAX_LEVEL` live in one module, and
  `promoteConceptsIfLessonComplete` writes exactly `QUIZ_MASTERY_LEVEL`.
- **Test:** `server/services/mastery/masteryLevels.test.ts` — `QUIZ_MASTERY_LEVEL > CONVERSATION_MAX_LEVEL`;
  a spy asserts the promotion writes the constant, not a literal.
- **Files:** new constants module, `server/services/quiz/quiz.service.ts`,
  `server/services/lessonAI/toolPolicy.ts`
- **AC:** spec.md #13 · `security.md` S7
- **Commit:** `refactor(mastery): name the two level ceilings in one module`

- [ ] Write the failing test · [ ] Run it, see it FAIL · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 14 — Concept names are validated before they reach an educational record

- **Contract:** names from `lessonInsights.concepts` are trimmed, deduplicated case-insensitively and
  rejected above 80 characters before `upsertMastery` — matching what the level-2 tool path already
  enforces.
- **Test:** `quiz.service.integration.test.ts` — an insights blob containing `"  Recursion "`,
  `"recursion"` and an 81-character name produces exactly one row, for the canonical `"Recursion"`.
- **Files:** `server/services/quiz/quiz.service.ts`
- **AC:** spec.md #16 · `security.md` S7
- **Commit:** `fix(quiz): validate concept names before level-3 promotion`

- [ ] Write the failing test · [ ] Run it, see it FAIL · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

> The higher authority was the looser path: `toolPolicy` guards a level-**2** write with an allowlist,
> a ceiling, canonicalisation and a length bound, while promotion wrote level **3** from unschema'd
> model JSON after one `typeof` check.

---

## Task 15 — A promotion is visible in telemetry

- **Contract:** a level-3 promotion emits one structured event per batch — six fields, no free text,
  no concept string — and emits none when `correctCount < quizzes.length`.
- **Test:** `quiz.service.integration.test.ts` — one event per completing submission with
  `subject: { kind: "quiz" | "lesson", id }`; zero events on an incomplete lesson; no field carries a
  concept name.
- **Files:** `server/services/quiz/quiz.service.ts`, `server/services/_shared/aiGuard/types.ts`
- **AC:** spec.md #17 · `security.md` S7
- **Commit:** `feat(quiz): emit a structured event on level-3 promotion`

- [ ] Write the failing test · [ ] Run it, see it FAIL · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

> `security.md` S10 item 4: nothing consumes this event yet. It is evidence for a later investigation,
> not detection — do not describe it as the latter.

---

## Task 16 — A mastery row records how it was earned

- **Contract:** `ConceptMastery` carries a nullable `evidence` enum. NULL means "written before this
  change", which is exactly the pre-change population `security.md` S8 needs isolated. New promotions
  write `QUIZ_FIRST_PASS` when every counted attempt was a first pass and `LEGACY` when any attempt
  count is unknown; the level-2 tool path writes `CONVERSATION`.
- **Test:** `server/repositories/conceptMastery.repository.integration.test.ts` — a first-pass
  promotion writes `QUIZ_FIRST_PASS`; a promotion counting a NULL-count attempt writes `LEGACY`; a
  pre-existing row keeps `evidence IS NULL`; a level-2 write over a level-3 row changes neither level
  nor evidence.
- **Files:** `prisma/schema/lessonAssistant.prisma`, migration,
  `server/repositories/conceptMastery.repository.ts`, `server/services/quiz/quiz.service.ts`
- **AC:** spec.md #18 · `security.md` D-A, D-G, S8
- **Commit:** `feat(mastery): record level-3 provenance`

- [ ] Write the failing test · [ ] Run it, see it FAIL · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

> **This column is shared with the `ai-tutor-guardrails` reopening** (items 12–15), which adds
> `APPLIED_CHECK`, backfills NULL → `LEGACY` and makes the column `NOT NULL`. Name it `evidence` with
> enum `MasteryEvidence` so that follow-on is an extension, not a rename. Existing rows are **left in
> place** (D-A) — attribution is impossible and downgrading real achievement is the worse error.
> Re-measure the pre-change population against production and record the number in `security.md` S8,
> which currently carries a local-dev count of one.

---

## Task 17 — Passing every quiz on a lesson still promotes, and a deleted quiz does not count

- **Contract:** promotion end to end through `quiz.submit` is unchanged in outcome, including a lesson
  carrying a soft-deleted quiz that must not count toward `quizzes.length`.
- **Test:** `quiz.service.integration.test.ts` — a lesson with 3 quizzes promotes on the third correct
  submission; the same lesson with a 4th soft-deleted quiz still promotes on the third.
- **Files:** none expected beyond what Tasks 13–16 touched
- **AC:** spec.md #14
- **Commit:** `test(quiz): pin end-to-end promotion including soft-deleted quizzes`

- [ ] Write the failing test · [ ] Run it, see it FAIL or PASS (say which) · [ ] Implement if needed
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## D. The AI path

## Task 18 — No quiz field but the question reaches a model or an embedding

- **Contract:** a static assertion over every `tool(` definition and every embedding source builder:
  none projects `correct` or `options`.
- **Test:** `server/services/quizFieldExposure.contract.test.ts` — beside
  `toolArguments.contract.test.ts`, whose file-walk shape it imitates.
- **Files:** new test file only
- **AC:** spec.md #19 · `security.md` S6
- **Commit:** `test(quiz): assert the answer key never reaches a model`

- [ ] Write the failing test · [ ] Run it, see it FAIL (by adding a temporary offending projection) ·
  [ ] Implement · [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 19 — `get_existing_quizzes` cannot leak the key even by accident

- **Contract:** the tool's output contains only questions, pinned against a fixture whose `correct` is
  a distinctive sentinel.
- **Test:** `server/services/quizAI/tools/getExistingQuizzes.tool.test.ts` — the sentinel does not
  appear in the tool's output.
- **Files:** new test file only
- **AC:** spec.md #20
- **Commit:** `test(quizAI): pin get_existing_quizzes to questions only`

- [ ] Write the failing test · [ ] Run it, see it PASS immediately (the tool already maps
  `q.question`, and Task 8 removes the field upstream — say so) · [ ] `pnpm typecheck` + `pnpm check`
  clean · [ ] Commit

---

## Task 20 — The conformance matrix says what is now true, and no more

- **Contract:** quizAI's `exclusions` entry is **narrowed**, not removed: the "answer key reaches a
  model or a student" half is gone and pinned by Tasks 12, 18 and 19; the "the key is model-authored
  and no layer checks which option is marked correct" half remains, because nothing in this feature
  addresses it.
- **Test:** `server/services/_shared/conformance/aiSurfaces.contract.test.ts` — the entry still exists
  and no longer claims the exposure half.
- **Files:** `server/services/_shared/conformance/aiSurfaces.ts:151-152`
- **AC:** spec.md #21. Gate Docs must still carry the matching amendment to `ai-defence-layers` S17,
  which describes C4 as a single out-of-scope item rather than two claims.
- **Commit:** `docs(conformance): narrow quizAI's answer-key exclusion to what remains true`

- [ ] Write the failing test · [ ] Run it, see it FAIL · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## E. The guarantee

## Task 21 — Level 3 cannot be reached without knowing the answers

- **Contract:** with the key removed and the cap in place, a student who does not know the answers
  cannot produce a correct attempt on every quiz of a lesson.
- **Test:** `server/services/quiz/answerKeyGuarantee.integration.test.ts` — a simulated attacker reads
  every student-reachable response for a 3-quiz lesson, finds no `correct`, exhausts the cap on each
  quiz with the correct option placed outside it, and ends with no `ConceptMastery` row at level 3.
- **Files:** new test file only
- **AC:** spec.md #12 · `security.md` S2
- **Commit:** `test(quiz): prove level 3 requires knowledge, not enumeration`

- [ ] Write the failing test · [ ] Run it, see it FAIL against `main` · [ ] Implement (nothing new —
  it should pass once Tasks 1–12 are in) · [ ] Run it, see it PASS · [ ] `pnpm typecheck` +
  `pnpm check` clean · [ ] Commit

> This is the task that makes the merge honest. `security.md` S2: both halves ship together or the
> platform *looks* fixed while the guarantee is false.

---

## Why the plan is thin

A plan carrying full implementation code only pays for itself when a *cheaper* model executes it.
Here the executor is the same model that wrote the plan, so the feature gets generated twice — once
as code inside markdown, once as code — and the two drift. Contracts and test names are enough to
execute from, and the compiler and the tests catch what prose cannot. — ADR-030.

**The exception, and it is narrow:** include code when the exact form of the code *is* the thing
being approved. One task here qualifies — **Task 1**, whose dedupe deletes rows that cannot be
re-derived.

## Self-review (run before handoff)

| AC | Task | AC | Task |
|---|---|---|---|
| 1 | 9 | 12 | 21 |
| 2 | 10 | 13 | 13 |
| 3 | 12 | 14 | 17 |
| 4 | 8 | 15 | 9 |
| 5 | 10 | 16 | 14 |
| 6 | 11 | 17 | 15 |
| 7 | 3 | 18 | 16 |
| 8 | 1, 2 | 19 | 18 |
| 9 | 3, 4 | 20 | 19 |
| 10 | 7 | 21 | 20 |
| 11 | 5 | 22 | 6 |

- **Guarded coverage:** every `security.md` control has a task — S3/D-B → 8; S4 → 10; S5 → 12; S6 → 18,
  19; S7 → 13, 14, 15; S8/D-A/D-G → 16; S2 → 21; D-D/D-E → 3, 4; D-F → 1, 2; D-C → 5.
- **Contract clarity:** every task states an observable behaviour.
- **Type consistency:** `attemptCount`, `evidence`, `MasteryEvidence`, `QUIZ_MASTERY_LEVEL`,
  `CONVERSATION_MAX_LEVEL` are used identically across tasks and match the names the
  `ai-tutor-guardrails` reopening expects.

## Final verification

- `pnpm typecheck`, `pnpm check`, `pnpm test:unit`, `pnpm test:integration` — all green.
- **Migration rehearsal against a copy of production data**, not an empty database: record the number
  of duplicate `(quizId, studentId)` pairs collapsed, the number with more than one *correct* row, and
  the pre-change level-3 population for `security.md` S8.
- Break each new contract test on purpose and watch it go red: reintroduce the cast (Task 10),
  add a `correct` projection to a tool (Task 18), widen `findByLesson` (Task 12). A test that never
  fails proves nothing.
- Manual: as an enrolled student, open a lesson with quizzes, confirm the network tab carries no
  answer key on any request, exhaust a quiz's attempts and confirm the cooldown message, then confirm
  the same quiz is answerable after the cooldown.
- Confirm `ai-tutor-guardrails`' `spec.md` still reads true where it depends on this feature — it
  names `attemptCount`, the cap, and the `evidence` column as inherited preconditions.