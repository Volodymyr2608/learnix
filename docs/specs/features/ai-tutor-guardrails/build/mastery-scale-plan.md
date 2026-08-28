# Mastery Scale — Implementation Plan (items 12–15)

> **For agentic workers:** execute with `superpowers:executing-plans` in this session — the warm
> context is the cheapest place to run TDD loops (ADR-030). Dispatch a subagent only for work that
> *reads a lot and returns little*; reconnaissance goes to `Explore`, never `general-purpose`.
> Steps use checkbox (`- [ ]`) syntax. See [`../spec.md`](../spec.md) items 12–15 for the design,
> and [`../security.md`](../security.md) for the controls each task must satisfy.

**Goal:** Make a mastery level state what kind of evidence exists — level 1 derived from completed
lessons, level 2 earned by answering a server-graded check question, level 3 by passing the quizzes
tagged with that concept — with no model judging a student's answer anywhere in the write path.

**Architecture:** Concept identity moves from a free-text string compared two different ways to a
stored `conceptKey` with the unique constraint on it. The tutor's `mark_concept_understood` is
replaced by `ask_concept_check`: the model **authors** a multiple-choice question, the server shuffles
the options and stores them, and a separate tRPC mutation grades by string equality. The check row is
buffered for the turn and committed only after `validateReply` passes, so a rejected turn leaves no
artifact by construction. The learning path derives level 1 at read time from data
`loadStudentSignal` already loads.

**Track:** `guarded` / complex tier. `pnpm classify` reports `STANDARD-OR-DIRECT — no new authority
and no control touched`, but it is reading a tree that holds documentation plus one unrelated
one-line fix; a diff cannot classify a change nobody has written yet. The feature adds a Prisma
model, two tRPC procedures, an agent tool and three migrations — **new authority on four counts**
(`documentation-process.md` §3a). Both threat agents ran in `design` mode on 2026-08-27 and their
controls are acceptance criteria in `spec.md`; every one has a task below. **ADR required at `/qa`.**

**Hard prerequisite:** [`quiz-answer-key`](../../quiz-answer-key/build/plan.md) ships **first**. It
owns `QuizAttempt.attemptCount`, the attempt cap, the answer-key projection and the nullable
`ConceptMastery.evidence` column. Until it lands, `quiz.getByLesson` returns the answer key to any
enrolled student and `QUIZ_FIRST_PASS` is forgeable at 100 % — cheaper than guessing a check. Stage 2
below extends its `evidence` column rather than creating one.

**Codebase anchors (verified during planning):**

- `createLessonAgent` tool array — closed literal, 4 entries (`server/services/lessonAI/lessonAI.agent.ts:103-112`); `SYSTEM_PROMPT` rules 5 and 6 at `:22-23`; `{conceptConstraint}` built at `:51-54` and spliced by **function** replacer at `:76-79` (a plain-string replace would let `$'` escape the wrapper).
- `lessonAI.agent.test.ts:172-179` pins the tool list against `ALLOWED_TOOL_NAMES`; `:128-144` pins `buildTutorSystemPrompt`; `:102-108` pins the level ceiling against `CONVERSATION_MAX_LEVEL`.
- `toolCallsSummary` push site (`server/services/lessonAI/lessonAI.service.ts:216-221`); `on_tool_end` artifact read (`:223-238`); assistant persistence with `toolCalls` (`:311-315`); history rebuilt **content-only** (`:85-89`) — the property that makes the answer key unrecoverable next turn.
- `validateReply` rule chain and precedence (`server/services/lessonAI/validateReply.ts:74-100`), `reject()` the single emitter (`:45-58`), `ReplyValidationRuleId` (`server/services/lessonAI/types.ts:16-21`), `ReplyValidationContext` (`:27-31`).
- `lessonAssistantRepository.getMessages` returns whole rows (`server/repositories/lessonAssistant.repository.ts:42-48`); `markContextIneligible` scopes ownership inside the query (`:133-142`) — the ADR-017 Rule 2 shape to imitate. Router `getHistory` returns them unprojected (`server/api/routers/lessonAssistant.ts:7-18`).
- **`BaseRepository` exposes `db`, never `tx`** (`server/repositories/base/base.repository.ts:61-68`); `transaction()` at `:536-547` hands a `tx` the repository singletons cannot use. `user.repository.ts:62-64` documents this exact trap. See Task 14.
- `anonymiseAccount`'s ordered transaction (`server/repositories/user.repository.ts:71-104`) — `lessonAssistantMessage` then `lessonAssistantConversation` deletes at `:83-88` are where `ConceptCheck` joins.
- `optionClassName(option, attempt, selected, isLocked)` (`app/_components/Quiz/QuestionCard/helpers/optionClassName.ts:7-43`) — reuse for the check panel rather than duplicating.
- `LessonAssistant/` has **no `components/` folder and no `types.ts`**; `Message` is declared inline (`hooks/useLessonAssistant.ts:5-10`). New UI must follow the component conventions even though its neighbour does not.
- SSE consumption branches per event type (`hooks/useLessonAssistant.ts:88-152`); `done` invalidates `getHistory` (`:149-152`).
- `FORWARD_TO_SENTRY` is a **total** `Record<SecurityOutcome, boolean>` (`server/services/_shared/aiGuard/securityLog.ts:14-29`) — adding an outcome fails to typecheck until classified. `SecurityOutcome` union at `server/services/_shared/aiGuard/types.ts:72-86`; `SecuritySubject` closed union at `:94-97`.
- `flowContract.contract.test.ts:52-67` asserts on-disk `.tool.ts` count **equals** `ALLOWED_TOOL_NAMES.length` — swapping one tool for another keeps it at 4; `:76-89` requires exactly 16 numbered flow steps.
- `toolArguments.contract.test.ts:35-46` fails any tool schema declaring an id-shaped Zod key — `checkId` is a tRPC input, never a tool argument, which is what keeps this green.
- `aiSurfaces.ts:81-99` — lessonAI entry has `trpcProcedures: []`; the two new procedures must be declared there.
- Evals: `CATEGORIES` closed list (`evals/lessonAI/tutorDataset.ts:18-33`), `GATED_THRESHOLDS` (`:49-52`, only `valid`/`valid-reworded` gated), `TutorRowSchema` (`:106-121`), stub `mark_concept_understood` (`evals/lessonAI/tutor.eval.ts:159-180`), registration key `"lessonAI:tutor"` (`evals/runEvals.ts:31`).
- `identifyWeakSignals` (`server/services/learningPathAI/nodes/identifyWeakSignals.node.ts:13-36`); `loadStudentSignal` already loads `completedLessonIds`, `lessonOrder[].concepts` and `mastery` in one `Promise.all` (`loadStudentSignal.node.ts:21-28`), so level-1 derivation needs **no new query**. `MasteryRowSchema` / `WeakConceptRowSchema` (`learningPathAI.state.ts:20-29`); `PathState` is a LangGraph `StateSchema` (`:43-67`), every field defaulted.
- `test/db.ts:6-38` `TABLES` is leaf-to-root; `concept_checks` inserts around index 15–17, ahead of `lesson_assistant_conversations` and `concept_mastery`.
- **No partial index and no raw `CHECK` constraint exists anywhere in `prisma/migrations/`.** The style precedent for hand-written SQL is `20260511104501_pgvector_init/migration.sql`. There is nothing to copy; Task 15 authors it.

**Per-task conventions:** after the implementation step, `pnpm typecheck` and `pnpm check` must be
clean before committing. Unit tests colocated `*.test.ts`; integration `*.integration.test.ts`
against `learnix_test`; contract `*.contract.test.ts`. Services and repositories export singletons;
services have a companion `.errors.ts`. Components: one per folder, prop types in `types.ts`, arrow
consts, no nested ternaries, sequential boolean guards. No `Co-Authored-By` trailer.

---

## Stage 1 — Concept identity and quiz tagging

Ships without any UX change and fixes a live defect on its own: a mastery row the tutor legitimately
wrote can fail to match in the learning path, because one call site compares case-insensitively and
the other does not.

## Task 1 — One comparison rule for concept names

- **Contract:** `conceptKey(name)` normalises (`trim`, collapse internal whitespace, lowercase) and
  `resolveAllowlistedConcept(needle, allowlist)` returns the allowlist's canonical spelling or null.
  These are the only place concept names are compared.
- **Test:** `server/services/_shared/concepts/conceptKey.test.ts` — idempotence; `"  API   Routes "`
  and `"api routes"` collapse to one key; `"C#"` and `"C"` do **not** collide; the resolver returns
  the allowlist spelling, never the needle's.
- **Files:** `server/services/_shared/concepts/conceptKey.ts` (new)
- **AC:** Concept identity 1–2
- **Commit:** `feat(concepts): one normalisation rule for concept identity`

- [ ] Write the failing test · [ ] Run it, see it FAIL (module absent) · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 2 — `ConceptMastery` is keyed by the normalised name

- **Contract:** the table carries `conceptKey`, backfilled from `concept`, colliding rows merged, and
  the unique constraint moved to `(studentId, courseId, conceptKey)`. The old unique **stays** for now.
- **Test:** `server/repositories/conceptMastery.keyParity.integration.test.ts` — TypeScript
  `conceptKey()` and the SQL backfill expression agree on a corpus containing **U+00A0, U+2009, `İ`,
  `ß`** and a combining-mark pair, and on every distinct `concept` value in a production copy.
  Separately: `"API Routes"` @2 and `"api routes"` @3 merge to one row at level 3.
- **Files:** `prisma/schema/lessonAssistant.prisma`, `prisma/migrations/<ts>_concept_mastery_key/`
- **AC:** Concept identity 3
- **`code included: an irreversible collision merge`** — archive into `concept_mastery_archive_merge`
  before deleting; the merge keeps `MAX(level)` and the spelling of the latest `updatedAt`.
- **Commit:** `feat(mastery): key concept mastery by its normalised name`

- [ ] Write the failing test · [ ] Run it, see it FAIL · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

> JS `\s` matches U+00A0 and U+2009; POSIX `[[:space:]]` does not. `lower()` is collation-dependent,
> `toLowerCase()` is not. If TypeScript folds more aggressively than SQL, two distinct rows map to one
> key and a write binds to the wrong row — an authorization bug wearing an encoding costume.

---

## Task 3 — Both call sites use the shared rule

- **Contract:** `toolPolicy` and `identifyWeakSignals` resolve concepts through Task 1 instead of
  their own inline comparisons.
- **Test:** existing `toolPolicy.test.ts` passes unchanged, plus a new case with doubled internal
  whitespace the old rule missed; a unit test for `identifyWeakSignals` where a mastery row
  `"API Routes"` matches a lesson concept `"api  routes"` — which today drops silently.
- **Files:** `server/services/lessonAI/toolPolicy.ts`,
  `server/services/learningPathAI/nodes/identifyWeakSignals.node.ts`
- **AC:** Concept identity 4
- **Commit:** `fix(mastery): compare concept names the same way everywhere`

- [ ] Write the failing test · [ ] Run it, see it FAIL · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 4 — Regenerating insights does not touch earned evidence

- **Contract:** no code change — a test pins the decision that `upsertByLessonId` never writes to
  `ConceptMastery`, so a renamed concept orphans a row rather than destroying it.
- **Test:** `server/repositories/lessonInsights.masteryOrphans.integration.test.ts` — after
  regeneration with renamed concepts the mastery row still exists and produces no weak-concept row.
- **Files:** new test file only
- **AC:** Concept identity 5
- **Commit:** `test(mastery): pin that insight regeneration preserves evidence`

- [ ] Write the failing test · [ ] Run it, see it PASS immediately (it pins existing behaviour — say
  so) · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 5 — A quiz knows which concept it tests

- **Contract:** `Quiz.concept` exists and quiz generation tags each question with a concept resolved
  through Task 1 against **the lesson row the ownership check returned**. Existing quizzes keep
  `concept = NULL`.
- **Test:** `server/services/quizAI/quizAI.service.integration.test.ts` — generated quizzes carry a
  concept drawn from the lesson's insights; a generated name outside the allowlist is not stored; a
  request naming another instructor's lesson tags nothing.
- **Files:** `prisma/schema/quiz.prisma`, migration, `server/services/quizAI/quizAI.service.ts`
- **AC:** Quiz evidence 3
- **Commit:** `feat(quiz): tag generated questions with the concept they test`

- [ ] Write the failing test · [ ] Run it, see it FAIL · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 6 — Promotion raises only the concepts actually tested

- **Contract:** `promoteConceptsIfLessonComplete` promotes per tagged concept; untagged legacy
  quizzes keep lesson-wide promotion. A promotion counting an unknown attempt count is labelled
  `LEGACY`, never `QUIZ_FIRST_PASS`.
- **Test:** `quiz.service.integration.test.ts` — a lesson whose three quizzes are tagged A, A, B
  promotes A and B and nothing else; a lesson with untagged quizzes promotes every concept as before;
  a promotion counting a NULL `attemptCount` writes `LEGACY`.
- **Files:** `server/services/quiz/quiz.service.ts`
- **AC:** Quiz evidence 1–2
- **Commit:** `feat(quiz): promote the concepts a quiz actually tested`

- [ ] Write the failing test · [ ] Run it, see it FAIL · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Stage 2 — The check mechanism, the write, and the reader

## Task 7 — A `ConceptCheck` exists, and only one can be open per lesson

- **Contract:** the table stores the authored question, its shuffled options, the correct option, and
  a status; a partial unique index makes a second `PENDING` row for one `(student, lesson)` pair
  unrepresentable.
- **Test:** `server/repositories/conceptCheck.repository.integration.test.ts` — a second `PENDING`
  insert raises; a third succeeds once the first is answered; `pg_indexes` reports the index with its
  `WHERE (status = 'PENDING')` predicate.
- **Files:** `prisma/schema/conceptCheck.prisma` (new), migration, `test/db.ts`
- **AC:** Check authoring 4; Migrations 6
- **`code included: raw SQL with no precedent in this repo`** — Prisma cannot express a partial unique
  index, so it lives only in the migration. The schema gets a comment naming the index, its migration
  file, and "never run `prisma db push` against a database carrying it."
- **Commit:** `feat(tutor): add the concept-check table`

- [ ] Write the failing test · [ ] Run it, see it FAIL · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

> Both assertions are required and they prove different things. The `pg_indexes` one catches a
> migration that drops the object; the behavioural one (second insert raises **and** a third after
> answering succeeds) catches a "helpful" re-creation without the `WHERE`, which a non-partial unique
> index would silently pass the first half of.

---

## Task 8 — Reading a pending check cannot return its answer

- **Contract:** `conceptCheckRepository.findPendingPublic` selects an explicit field list excluding
  `correct`, typed `ConceptCheckPublic`. No inherited generic read returns a whole row.
- **Test:** same integration file — the returned object has no `correct` **key** (structural, not a
  value assertion); every exported function of the repository is walked and none returns an object
  containing it.
- **Files:** `server/repositories/conceptCheck.repository.ts` (new)
- **AC:** Answer-key confidentiality 3
- **Commit:** `feat(tutor): concept-check reads exclude the answer`

- [ ] Write the failing test · [ ] Run it, see it FAIL · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 9 — Answering a check is a single-use, race-free claim

- **Contract:** `claimForAnswer` is one conditional `UPDATE … WHERE id AND studentId AND
  status='PENDING' AND expiresAt > now() RETURNING *`. There is no `findFirst` on this table in the
  answer path.
- **Test:** same integration file — the claim returns a row once and zero rows on replay; an expired
  row returns zero; another student's id returns zero and leaves the row `PENDING`; two parallel
  claims produce exactly one winner.
- **Files:** `server/repositories/conceptCheck.repository.ts`
- **AC:** Answering 3, 5
- **Commit:** `feat(tutor): claim a concept check atomically`

- [ ] Write the failing test · [ ] Run it, see it FAIL · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

> Splitting this into SELECT-then-UPDATE, or hoisting the `status`/`expiresAt` test into TypeScript,
> is the two-questions shape ADR-023 forbids. Under READ COMMITTED the loser re-evaluates its `WHERE`
> against the updated row and matches nothing — single-use is a property of the statement, not of a
> lock.

---

## Task 10 — Issuing a check sweeps expired ones and enforces the budget

- **Contract:** `conceptCheckService.issue()` verifies enrollment, expires stale `PENDING` rows for
  the pair **in the same transaction as the insert**, and refuses when a check is already open, the
  concept already has evidence, or the 3-per-concept / 24-hour cooldown budget is spent.
- **Test:** `server/services/conceptCheck/conceptCheck.service.integration.test.ts` — a check whose
  `expiresAt` has passed does not block a new one; a fourth check for a concept is refused; a retry
  19 hours after a wrong answer is refused and at 25 hours is allowed; a lesson the student is not
  enrolled in creates nothing.
- **Files:** `server/services/conceptCheck/{conceptCheck.service.ts,conceptCheck.errors.ts}` (new)
- **AC:** Check authoring 5, 7; Answering 9
- **Commit:** `feat(tutor): issue concept checks within a budget`

- [ ] Write the failing test · [ ] Run it, see it FAIL · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

> Index predicates must be immutable, so `expiresAt > now()` cannot go into the partial index. Without
> the sweep, one abandoned check holds that lesson's only slot **forever**.

---

## Task 11 — Every failure to claim looks the same

- **Contract:** absent, foreign, already-answered and expired checks all produce one error class with
  one message, mapped to a single tRPC code.
- **Test:** same integration file — four distinct causes produce byte-identical code and message.
- **Files:** `server/services/conceptCheck/conceptCheck.errors.ts`
- **AC:** Answering 4
- **Commit:** `feat(tutor): one indistinguishable error for an unavailable check`

- [ ] Write the failing test · [ ] Run it, see it FAIL · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

> Distinguishable errors turn `checkId` into an oracle. Same requirement, same reason, as S9's
> byte-identical refusals.

---

## Task 12 — The authored check must be well-formed and grounded

- **Contract:** `authorizeAskConceptCheck` denies on: concept not resolving through the allowlist;
  fewer than 4 or more than 5 options; options not distinct after normalisation; `correctOption` not
  among them; the question containing the correct option; an option carrying a URL, markdown link or
  HTML tag; either field outside its length bounds; and **a turn that made no
  `retrieve_lesson_context` call**.
- **Test:** `server/services/lessonAI/toolPolicy.test.ts` — one case per rule id; first failing rule
  wins and is the only id logged; `"A"` vs `"a."` counts as a duplicate; a legitimate well-formed
  check on a grounded turn is authorised (the false-positive direction).
- **Files:** `server/services/lessonAI/toolPolicy.ts`, `server/services/lessonAI/types.ts`
- **AC:** Check authoring 1–2
- **Commit:** `feat(tutor): authorize concept-check authoring`

- [ ] Write the failing test · [ ] Run it, see it FAIL · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

> Grounding is what answers *"ask me a check whose correct answer is 'banana'"* — pattern-free,
> on-topic, and perfectly well-formed, so nothing else in the stack sees it.

---

## Task 13 — Denials are split into two classes with two events

- **Contract:** adversarial denials emit `unsafe_tool_call` and return `NEUTRAL_REFUSAL_MESSAGE`;
  benign ones emit a new, **non-forwarded** `tool_call_declined` and return an explanatory result.
  `mastery_write_retained` leaves the taxonomy.
- **Test:** `toolPolicy.test.ts` + `securityLog.test.ts` — `empty_allowlist` emits
  `tool_call_declined`, not `unsafe_tool_call`; `FORWARD_TO_SENTRY` classifies the new outcome as
  false; repeated denials inside one turn emit one event, not one per attempt.
- **Files:** `server/services/_shared/aiGuard/types.ts`,
  `server/services/_shared/aiGuard/securityLog.ts`, `server/services/lessonAI/toolPolicy.ts`
- **AC:** Bounds (one event per turn); spec.md item 1 denial table
- **Commit:** `feat(aiGuard): separate benign tool declines from unsafe calls`

- [ ] Write the failing test · [ ] Run it, see it FAIL (`FORWARD_TO_SENTRY` is total — it will not
  compile until the new outcome is classified) · [ ] Implement · [ ] Run it, see it PASS ·
  [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

> A lesson whose insights simply never generated currently raises a Sentry-forwarded zero-baseline
> alert. Routing routine denials into `fallback_triggered` instead would be the same mistake with a
> different label — its baseline is zero because it means "L2 is down".

---

## Task 14 — Grading writes mastery, in one transaction with the claim

- **Contract:** `conceptCheckService.answer()` claims the check, compares strings, and on a correct
  first answer writes level 2 with `evidence: APPLIED_CHECK` — claim and write in **one**
  transaction. Everything written comes from the claimed row; the mutation input carries only
  `checkId` and the chosen option's position.
- **Test:** `conceptCheck.service.integration.test.ts` — a correct first answer writes exactly one
  row; a wrong answer writes nothing and burns the check; forcing the mastery write to throw leaves
  the check `PENDING` and no row; a cancelled enrollment cannot grade; `expiresAt` is compared against
  the database clock.
- **Files:** `server/services/conceptCheck/conceptCheck.service.ts`,
  `server/repositories/conceptMastery.repository.ts`
- **AC:** Answering 1, 2, 6, 7, 8, 10
- **Commit:** `feat(tutor): grade a concept check and record the evidence`

- [ ] Write the failing test · [ ] Run it, see it FAIL · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

> **The transaction is the hard part, and the repo already documents the trap.** `BaseRepository`
> exposes `db`, never `tx` (`base.repository.ts:61-68`), so `upsertMastery` as it stands cannot join a
> caller's transaction — exactly what `user.repository.ts:62-64` warns about. `upsertMastery` needs an
> optional transaction client parameter, or the write must be issued through the same `tx` inline.
> Choose one and say which in the commit; do not leave two non-atomic statements behind a comment
> claiming atomicity.

---

## Task 15 — A level states evidence, and levels 0 and 1 become unrepresentable

- **Contract:** `evidence` gains `APPLIED_CHECK`, NULLs backfill to `LEGACY`, the column becomes
  `NOT NULL`, rows at level ≤ 2 are deleted, and `CHECK (level IN (2,3))` is added last.
- **Test:** `conceptMastery.repository.integration.test.ts` — a seeded level-1 row is gone after
  migrating; a level-3 row survives as `LEGACY`; a direct insert at level 1 raises; `pg_constraint`
  reports the CHECK.
- **Files:** `prisma/schema/lessonAssistant.prisma`, migration
- **AC:** Evidence semantics 1; Migrations 2–4
- **`code included: an irreversible delete on an educational record`** — archive into
  `concept_mastery_archive_le2` first; ordering is archive → delete → add column nullable → backfill →
  set NOT NULL → add CHECK **last** (earlier it fails on the pre-delete rows).
- **Commit:** `feat(mastery): a level now states what evidence produced it`

- [ ] Write the failing test · [ ] Run it, see it FAIL · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

> **This task must not ship without Task 20.** Today's reader derives the weak set only from persisted
> rows, so deleting the level-≤2 rows alone makes those concepts vanish from review entirely — the
> opposite of the invariant the delete is justified by. They ship in one deploy.

---

## Task 16 — The tutor asks instead of recording

- **Contract:** `ask_concept_check` replaces `mark_concept_understood` in the closed tool literal and
  in `ALLOWED_TOOL_NAMES`; the server shuffles options with a CSPRNG before persisting and grades by
  text, never index; the tool's result is a bare acknowledgement. Prompt rules 5–6 are replaced.
- **Test:** `tools/askConceptCheck.tool.test.ts` — the stored option order is a function of the RNG,
  not of the authored order; the tool result contains no substring of any argument of eight
  characters or more. `lessonAI.agent.test.ts` — the tool list still matches `ALLOWED_TOOL_NAMES`;
  the prompt never offers to record on request.
- **Files:** `server/services/lessonAI/tools/askConceptCheck.tool.ts` (new),
  delete `tools/markConceptUnderstood.tool.ts`, `server/services/lessonAI/lessonAI.agent.ts`
- **AC:** Check authoring 3; Answer-key confidentiality 4
- **Commit:** `feat(tutor): replace the mastery write tool with a check question`

- [ ] Write the failing test · [ ] Run it, see it FAIL · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

> The shuffle is the cheapest control in the feature: it makes "always make the correct option A"
> a no-op whether it arrives by injection or as the model's own positional bias. Keep the
> `{conceptConstraint}` splice a **function** replacer — a plain string replacement lets `$'` escape
> the wrapper.

---

## Task 17 — Persisted tool calls carry only what each tool declares safe

- **Contract:** `toolCallsSummary` is built from a **per-tool field allowlist, default-deny**: a tool
  with no declaration persists `{ tool }` and nothing more.
- **Test:** `lessonAI.service.test.ts` — for every tool in `ALLOWED_TOOL_NAMES` the persisted entry's
  keys are a subset of its declared safe fields; a hypothetical undeclared tool persists only its
  name.
- **Files:** `server/services/lessonAI/lessonAI.service.ts`
- **AC:** Answer-key confidentiality 1
- **Commit:** `fix(tutor): allowlist what a tool call may persist`

- [ ] Write the failing test · [ ] Run it, see it FAIL · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

> Redacting `ask_concept_check` **by name** would work today and break silently on a rename, or on the
> next tool that carries a secret. Default-deny is what makes the class unrepresentable.

---

## Task 18 — The history endpoint stops shipping tool calls at all

- **Contract:** `getHistory` returns an explicit projection — `id`, `role`, `content`, `createdAt`.
  Replayed history stays content-only.
- **Test:** `server/api/routers/lessonAssistant.integration.test.ts` — `"toolCalls" in row === false`
  (key absence, not `undefined`); given persisted rows carrying `toolCalls`, the messages passed to
  the agent contain no tool-call arguments.
- **Files:** `server/repositories/lessonAssistant.repository.ts`,
  `server/api/routers/lessonAssistant.ts`
- **AC:** Answer-key confidentiality 2, 5
- **Commit:** `fix(tutor): project tool calls out of the history payload`

- [ ] Write the failing test · [ ] Run it, see it FAIL · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

> Content-only replay holds today by accident (`lessonAI.service.ts:85-89`) and is the strongest
> confidentiality property in the design. Pin it before someone adds tool-call replay "for
> continuity" and hands the answer key back to the model.

---

## Task 19 — Nothing model-authored is persisted before the boundary passes

- **Contract:** the authored check is buffered for the turn and committed with the assistant message,
  after `validateReply` returns valid. A new `concept_check_answer_echo` rule **suppresses the check**
  when the reply contains the correct option — it does not retract the reply.
- **Test:** `lessonAI.service.test.ts` — a turn whose reply fails validation, is aborted, or errors
  mid-stream leaves zero `ConceptCheck` rows; the emitted SSE event has no `correct` key.
  `validateReply.test.ts` — a reply containing the correct option suppresses; one containing a
  *wrong* option does not; with no check posted the rule cannot fire.
- **Files:** `server/services/lessonAI/lessonAI.service.ts`,
  `server/services/lessonAI/validateReply.ts`, `server/services/lessonAI/types.ts`
- **AC:** Answer-key confidentiality 6–7; spec.md item 15
- **Commit:** `feat(tutor): commit an authored check only after the output boundary`

- [ ] Write the failing test · [ ] Run it, see it FAIL · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

> Suppression, not retraction: the correct option is by construction a phrase from the lesson the
> tutor just explained, so exact-substring matching has a structurally high false-positive rate —
> unlike `system_prompt_echo`, whose markers never occur in legitimate prose. Fail-closed on the
> *check* costs nothing; fail-closed on the *reply* destroys a legitimate turn on a collision.
> Deferring the commit is also what retires `mastery_write_retained` rather than reinventing it.

---

## Task 20 — The learning path derives "encountered" instead of reading it

- **Contract:** weak concepts become (completed lessons × their concepts) ∪ (persisted rows), keyed;
  level 1 derived where no row exists; level 3 dropped. `WeakConceptRow.level` becomes
  `evidence: "encountered" | "applied"`, and `proposeReviews` renders a label from a lookup map.
- **Test:** `identifyWeakSignals.test.ts` — a concept in a completed lesson with no row is weak at
  `encountered`; with a level-2 row it is `applied`; at level 3 it is absent; an orphaned row appears
  with an empty `firstLessonId` and produces no review step. `proposeReviews.test.ts` — no output
  renders a bare numeric scale.
- **Files:** `server/services/learningPathAI/learningPathAI.state.ts`,
  `nodes/identifyWeakSignals.node.ts`, `nodes/proposeReviews.node.ts`, `nodes/mergeAndExplain.node.ts`
- **AC:** Evidence semantics 2–5
- **Commit:** `feat(learning-path): derive encountered concepts instead of storing them`

- [ ] Write the failing test · [ ] Run it, see it FAIL · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

> Needs no new query — `loadStudentSignal` already loads all three inputs in one `Promise.all`.
> `LearningPathCache.weakConcepts` stores `string[]`, so no cache migration is required.

---

## Task 21 — The student can answer a check

- **Contract:** `lessonAssistant.pendingCheck` (query) and `answerConceptCheck` (mutation), both
  `studentProcedure`, delegating authority to the service; a panel below the thread renders the open
  check and submits an option.
- **Test:** `lessonAssistant.conceptCheck.integration.test.ts` — a cross-student `checkId` is
  rejected; the query payload has no `correct`; `clearHistory` leaves a pending check intact.
  Component tests — options render, submit is disabled with nothing selected, the panel disappears
  once answered.
- **Files:** `server/api/routers/lessonAssistant.ts`,
  `app/_components/Course/components/LessonAssistant/components/ConceptCheckPanel/{index.tsx,types.ts}`,
  `.../components/CheckOption/{index.tsx,types.ts}`, `.../hooks/useConceptCheck.ts`
- **AC:** Answering 4 (surface); Answer-key confidentiality 8
- **Commit:** `feat(tutor): answer a concept check from the lesson panel`

- [ ] Write the failing test · [ ] Run it, see it FAIL · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

> Reuse `optionClassName` from `QuestionCard/helpers/` rather than duplicating option styling. Render
> the question and options as **plain text, not markdown** — model-authored text into a browser is the
> S13 §32 class, and plain text closes it outright. The surrounding `LessonAssistant/` folder does not
> follow the component conventions; the new folders do.

---

## Task 22 — A deleted account takes its checks with it

- **Contract:** `anonymiseAccount` deletes the student's `ConceptCheck` rows inside its existing
  transaction, alongside the tutor-conversation deletes.
- **Test:** `user.repository.integration.test.ts` — after anonymisation no `concept_checks` row
  references the deleted user.
- **Files:** `server/repositories/user.repository.ts`, `prisma/schema/conceptCheck.prisma`
- **AC:** `security.md` (account deletion, added at Gate Docs)
- **Commit:** `fix(account-deletion): destroy concept checks with the conversation`

- [ ] Write the failing test · [ ] Run it, see it FAIL · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

> **Without this the feature does not leak — it breaks.** `ConceptCheck` is a new required relation to
> `User` and Prisma's default action is `Restrict`, so account deletion fails outright (GDPR Art. 17).
> The FK cascade is not the control either: ADR-025 never deletes the `User` row, so `onDelete` never
> fires. The explicit `deleteMany` is what erases it.

---

## Stage 3 — Gates

## Task 23 — The flow contract describes the flow that exists

- **Contract:** `flow-contract.md` gains a station for `ask_concept_check`, rewrites station 18, adds
  the out-of-band answer write path, and adds failure-matrix rows for pending/expired/budget cases.
- **Test:** `flowContract.contract.test.ts` passes — it asserts the on-disk tool count equals
  `ALLOWED_TOOL_NAMES.length` (4 = 4 after the swap) and that exactly 16 numbered steps remain.
- **Files:** `docs/specs/features/ai-tutor-guardrails/flow-contract.md`
- **AC:** Gate Docs
- **Commit:** `docs(tutor): document the concept-check stations`

- [ ] Run the contract test, see it FAIL · [ ] Write the rows · [ ] Run it, see it PASS · [ ] Commit

---

## Task 24 — The conformance registry names the new procedures

- **Contract:** the lessonAI entry's `trpcProcedures` lists `lessonAssistant.pendingCheck` and
  `lessonAssistant.answerConceptCheck`; no new `GUARDED_ENTRY_POINTS` entry is needed because no new
  model is constructed.
- **Test:** `aiSurfaces.contract.test.ts` and `entryPoints.contract.test.ts` stay green.
- **Files:** `server/services/_shared/conformance/aiSurfaces.ts`
- **AC:** Gate Docs
- **Commit:** `chore(conformance): declare the concept-check procedures`

- [ ] Write the failing test · [ ] Run it, see it FAIL · [ ] Implement · [ ] Run it, see it PASS ·
  [ ] Commit

---

## Task 25 — The evals measure what the rows now mean

- **Contract:** `CATEGORIES` gains `check-question`; the stub `mark_concept_understood` becomes a stub
  `ask_concept_check`; `mastery-lookalike` and `tool-abuse` expectations become "`ask_concept_check`
  fires, nothing is written". New report-only rows measure authoring validity, answer-echo
  false-positive rate and authored-position bias, plus four `aiGuard:indirect` rows for poisoned
  chunks steering the authoring.
- **Test:** `tutorDataset.contract.test.ts` and `tutorDataset.test.ts` — every row parses and every
  category is declared. The baseline resets because the prompt hash changes.
- **Files:** `evals/lessonAI/tutorDataset.ts`, `evals/lessonAI/tutor.eval.ts`,
  `evals/datasets/lessonAI/tutor.jsonl`, `evals/datasets/aiGuard/indirect.jsonl`,
  `evals/baselines/lessonAI-tutor.json`
- **AC:** spec.md Test & eval scenarios
- **Commit:** `test(evals): re-express the mastery rows around the check question`

- [ ] Write the failing test · [ ] Run it, see it FAIL · [ ] Implement · [ ] Run it, see it PASS ·
  [ ] Run `pnpm eval lessonAI:tutor`, record the new baseline · [ ] Commit

> Each new row must **decide** something or it is a number nobody reads: authoring validity decides
> the validator's false-positive rate against the shipped model; the echo rate decides whether
> suppression alone suffices; position bias decides how load-bearing the shuffle is. No thresholds on
> a first measurement — the repo's own precedent is against setting a bar before the first run.

---

## Task 26 — Gate Docs

- **Contract:** `security.md` S3, S4, S7, S11, S12, S13 §5/§11/§24 amended per `spec.md`'s doc-amendment
  list; `manual-qa.md` MQ-1/2/4 rewritten around "did the tutor refuse to record and ask instead",
  plus a new row for deliberately answering wrong; `learning-path/spec.md` updated for the union and
  the label change; `account-deletion-data-retention/spec.md` gains `ConceptCheck`;
  `ai-defence-layers` S17 amended alongside `quiz-answer-key`'s C4 narrowing; `spec.md` status back to
  `stable`; `pnpm spec:sync`; **ADR written** (complex tier).
- **Test:** `specSections.contract.test.ts` green; `pnpm spec:sync` produces no diff.
- **Files:** the documents above, `docs/adr/NNN-mastery-evidence.md`
- **AC:** Gate Docs / DoD
- **Commit:** `docs(mastery): gate docs and ADR for the evidence scale`

- [ ] Amend each document · [ ] `pnpm spec:sync` · [ ] Contract tests green · [ ] Commit

---

## Why the plan is thin

A plan carrying full implementation code only pays for itself when a *cheaper* model executes it.
Here the executor is the same model that wrote the plan, so the feature gets generated twice — once
as code inside markdown, once as code — and the two drift. Contracts and test names are enough to
execute from, and the compiler and the tests catch what prose cannot. — ADR-030.

**The exception, and it is narrow:** three tasks qualify — **2** and **15**, whose migrations delete
rows that cannot be re-derived, and **7**, whose partial unique index is raw SQL with no precedent
anywhere in this repository.

## Self-review (run before handoff)

| Criteria group | Tasks |
|---|---|
| Concept identity (5) | 1, 2, 3, 4 |
| Check authoring (7) | 7, 10, 12, 16 |
| Answering and the write (9) | 9, 10, 11, 14, 21 |
| Evidence semantics (5) | 15, 20 |
| Quiz evidence (3) | 5, 6 |
| Answer-key confidentiality (8) | 8, 16, 17, 18, 19, 21 |
| Migrations (6) | 2, 7, 15, and the follow-up drop below |
| Bounds additions | 10, 13 |

- **Guarded coverage:** every design-pass control has a task — grounding → 12; CSPRNG shuffle → 16;
  per-tool allowlist → 17; `getHistory` projection → 18; deferred commit + echo rule → 19; expiry
  sweep → 10; one-transaction claim → 14; byte-identical errors → 11; account deletion → 22;
  index/CHECK assertions → 7, 15; denial classes → 13.
- **Not a task, and deliberately so:** the follow-up migration dropping the **old** `ConceptMastery`
  unique. It must deploy *after* the new code is live — `ON CONFLICT` names it, and quiz promotion
  catches and logs its own failures, so dropping it early shows up as silently missing evidence rather
  than an error. It belongs to the next release, and `/qa` should confirm it is scheduled, not merged.
- **Contract clarity:** every task states an observable behaviour.
- **Type consistency:** `conceptKey`, `resolveAllowlistedConcept`, `evidence`, `MasteryEvidence`,
  `APPLIED_CHECK`, `QUIZ_FIRST_PASS`, `LEGACY`, `ConceptCheckPublic`, `tool_call_declined` are used
  identically across tasks and match the names `quiz-answer-key` establishes.

## Final verification

- `pnpm typecheck`, `pnpm check`, `pnpm test:unit`, `pnpm test:integration` — all green.
- **Migration rehearsal on a copy of production data**, not an empty database: record rows archived
  and deleted at level ≤ 2, `conceptKey` collision groups merged, and confirm the post-conditions.
- `pnpm eval lessonAI:tutor` and `pnpm eval learningPathAI:learningPath` — record both baselines.
- Break each new contract test on purpose: drop the partial index, re-add a `correct` projection,
  re-introduce tool-call replay. A test that never fails proves nothing.
- **Manual QA against `pnpm dev`**, recording sha and verdict per row: MQ-1 (a claim produces a
  question and no row), the wrong-answer path (nothing written, cooldown, a *different* question
  after), the happy path (one level-2 `APPLIED_CHECK` row), and a check that the answer never appears
  in `lesson_assistant_messages.toolCalls` or the `getHistory` payload.
- Confirm `quiz-answer-key` is merged and deployed before Stage 2 reaches production.