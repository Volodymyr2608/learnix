# Security — quiz-answer-key

**Status:** design (produced at `/spec`, 2026-08-18) · **Tier:** complex ·
**Method:** two design-mode agent passes (`security-auditor`, `llm-security-auditor`) over the
drafted spec, plus code verification of every load-bearing claim.

Written as requirements, so it can be followed without reading the implementation. Every control
here also appears as an acceptance criterion in [`spec.md`](./spec.md) — that is what makes `/plan`
unable to omit it and `/qa` able to check it back.

Source finding: `docs/security/2026-08-16-ai-content-supply-chain.md` C4.

---

## S1. What this feature defends

The asset is not the answer key itself. It is the **claim that level-3 mastery means something** — a
claim `ai-tutor-guardrails` makes in order to justify letting the tutor write levels 1 and 2 at all.

**Assets**
- `Quiz.correct` — an assessment secret, confidential to the student audience. Not PII.
- `ConceptMastery.level` — a durable educational record, written automatically, consumed by
  `learningPathAI` to decide what a student is never shown again.
- `QuizAttempt` — the evidence of record. Its usefulness depends on it recording what happened.

**Actors**
- **Enrolled student — the malicious-but-legitimate actor.** Authorised for every call in this
  feature. Wants level 3 without learning. Every control here is aimed at this actor.
- Instructor owning the course — legitimately reads `correct`; unchanged.
- Non-enrolled and anonymous callers — already excluded by `studentProcedure` + `verifyEnrollment`,
  verified, not re-litigated.

## S2. The exposure is two-layered, and fixing one layer alone is a regression in honesty

| Layer | Today | After |
|---|---|---|
| Read the key | One request returns `correct` for every quiz on the lesson | Field never loaded on the student path |
| Guess the key | Unlimited graded retries, wrong attempt overwrites its own row | `min(3, options.length − 1)` attempts, then a 24h cooldown; `attemptCount` retained |

**Requirement.** Both ship together. Removing the key alone converts a one-request read into a
≤3-request enumeration — measurably cheaper than learning — while making the platform *look* fixed:
the `ai-defence-layers` conformance matrix would drop quizAI's C4 exception on a guarantee that is
still false. That is the failure mode this repository has been closing for two features running.

**Requirement.** The cap is `min(3, options.length − 1)`, not a fixed number. `Quiz.options` is
instructor-controlled, so a constant 3 is not always below the option count.

## S3. The control is a projection, not a permission check

Both procedures are already correctly authorised: `studentProcedure`, plus `verifyEnrollment` on the
quiz path and an enrollment predicate inside the same `findFirst` on the lesson path. The defect is
that an authorised read returns more than its audience should see.

**Requirement.** Narrow at the **repository**, not at the caller. `quizRepository.findByLesson`
selects an explicit field list. Loading the field and dropping it later leaves it in memory, in any
log line that dumps the object, and in any future `...spread`.

**Requirement.** Do not branch on role inside the service. Two audiences in one function drift; a
third audience (admin export, grading review) must be added as a deliberate accessor.

**Verified safe:** `quiz.submit` grades through `quizRepository.findOne`, a different method, so
narrowing `findByLesson` cannot affect grading. Its three callers need `id`, `question`, `options`,
`lessonId` — none needs `correct`.

## S4. The type must not outlive the field

`lessonService.getStudentLesson` currently ends `return lesson as typeof lesson & { quizzes: Quiz[] }`.

**Requirement.** Remove the cast. With it, narrowing the projection leaves TypeScript asserting that
`quiz.correct: string` exists on a student-facing value; a component reads `undefined` at runtime and
the plausible "fix" is to put the field back. This single line is the most likely way this feature
gets undone.

Note that types cannot be the completeness check either: `QuizSchema` and `QuizCreateDto` both carry
`correct`, so a future router returning a `Quiz`-typed value typechecks regardless.

## S5. Completeness is a serialised-response walk, not a grep

**Requirement.** Enumerate every `studentProcedure`, invoke each against a seeded lesson with
quizzes, and deep-walk the serialised result for a key named `correct` at any depth.

Both a text search and a type check fail here for opposite reasons: `analytics.repository.ts` returns
`{ attempts, correct: number }` — an aggregate that shares the *word* — and would be a false
positive; a future nested `include` would be a false negative.

**Traced and clean today** (do not re-audit; re-pin by test): embeddings index `lesson.content` only
and never quiz rows; `get_existing_quizzes` maps `q.question`; `get_student_progress` returns lesson
titles; `learningPathAI` reads `QuizAttempt`, never joining `Quiz`; certificates, notifications,
search and every `app/api/**` handler touch no quiz data.

## S6. The AI path is closed by accident and must be closed by test

A student asking the tutor "what is the answer to question 3" has no retrieval path today — quizzes
are not embedded and no tool projects `correct`. But that is a property of four files that happen not
to read `quizRepository`, and the next "give the tutor quiz awareness" ticket reopens C4 through a
door nothing names.

**Requirement.** A static assertion over every `tool(` definition and every embedding source builder:
no quiz field other than `question` reaches a model or an embedding. It belongs beside
`toolArguments.contract.test.ts`, not in the quiz tests — it is the model-side twin of S5.

**Requirement.** `get_existing_quizzes` is pinned against a fixture whose `correct` is a distinctive
sentinel; the sentinel must not appear in the tool's output.

**Not re-reported** (accepted in `ai-tutor-guardrails` S13 §9): an instructor who writes worked
answers into the lesson *body* is reachable through RAG. That is lesson content, not the key.

## S7. The level-3 write path must not validate less than the level-2 one

`authorizeMarkConceptUnderstood` guards a level-**2** write with empty-allowlist deny, a ceiling,
allowlist membership, canonical spelling and `z.string().min(1).max(80)`, and emits `unsafe_tool_call`
on denial. `promoteConceptsIfLessonComplete` writes level **3** from unschema'd model JSON after a
single `typeof name === "string"` filter, with no ceiling constant, no length bound, no
canonicalisation and no event.

**Requirement.** Trim, deduplicate case-insensitively and bound at 80 characters before
`upsertMastery`, matching the tool schema.

**Requirement.** `QUIZ_MASTERY_LEVEL` and `CONVERSATION_MAX_LEVEL` are named constants in one module,
with a test asserting `QUIZ_MASTERY_LEVEL > CONVERSATION_MAX_LEVEL`. That is what makes the comment
in `toolPolicy.ts` enforceable rather than decorative.

**Requirement.** A promotion emits one structured event per batch — six fields, no free text, no
concept string.

## S8. Provenance, because a credential is coming

`ConceptMastery` rows at level 3 written before this change have unverified provenance: they may have
been earned by reading the key. Attribution is impossible — a network-tab reader and a competent
student are indistinguishable in the data — and downgrading real achievement to erase a hypothetical
is the worse error.

**Decision (D-A):** existing rows are left in place.

**Requirement.** Identification, however, is free and must not be skipped. `upsertMastery` moves
`updatedAt` only when the level actually rises, so `level = 3 AND updatedAt < <deploy>` isolates the
pre-change population exactly, with no migration.

**Requirement.** Because a certificate or public profile is expected to consume level 3
(developer decision, 2026-08-18), provenance is recorded as a **column**, not as a paragraph here.
Adding it later, once the table is large and the cutoff has passed, is both expensive and
unrecoverable.

**Measured 2026-08-18 (local dev database):** 3 `ConceptMastery` rows in total — 2 at level 2, **1 at
level 3**. The pre-change population carrying unverified provenance is therefore a single row here.
Re-measure against production before deploying: the control is the cutoff column, and this number
only says how much history it has to cover in this environment.

**Re-measured 2026-08-28, after the `evidence` column landed (local dev):** unchanged — 3 rows, all
with `evidence IS NULL`, of which **1 is at level 3**. That NULL is now the cutoff itself:
`level = 3 AND evidence IS NULL` isolates the pre-change population without needing a deploy
timestamp. **Production is still unmeasured** — the number above is dev only, and `/qa` should not
read it as the production figure.

The enum shipped with a fourth member the design pass did not name: `QUIZ_RETRIED`, for a promotion
where every quiz was answered correctly but at least one took more than one attempt. Without it that
case had to be recorded as `QUIZ_FIRST_PASS`, which would make the column assert something the
attempt rows contradict — the opposite of what provenance is for. `LEGACY` keeps its meaning: at
least one attempt row predates the counter, so how many tries it took is unknowable.

## S9. Decision record

| # | Decision | Choice | Rationale |
|---|---|---|---|
| D-A | Existing level-3 rows | **Leave in place**, mark provenance | Attribution impossible; downgrading real achievement is the worse error |
| D-B | Where to narrow | **Repository `select`** | The field is never loaded, so it cannot be spread, logged or re-exposed. No caller of `findByLesson` needs it; grading uses `findOne` |
| D-C | Reveal the answer after an attempt | **Never** | Revealing after a wrong attempt re-opens the bypass through a friendlier door; after a correct one it tells the student what they just picked |
| D-D | Attempt cap in this feature | **Yes** | Without it AC 12 is false on merge and the conformance matrix certifies a guarantee that does not hold |
| D-E | Cap shape | **`min(3, options.length − 1)`, then a 24h cooldown** | Always below the option count, so enumeration is arithmetically impossible; a cooldown does not permanently deny level 3 to a student who genuinely misunderstood |
| D-F | `QuizAttempt.attemptCount` | **Added** | Without it a brute-force run is indistinguishable from a first-try correct answer, because a wrong attempt overwrites its own row |
| D-G | Provenance marker | **Column, not a spec paragraph** | A credentialing consumer is expected; the cutoff is cheap now and unrecoverable later |

## S10. Accepted risks and residuals

1. **Existing level-3 rows keep unverified provenance** (D-A). Bounded by the column from S8, so a
   future credentialing feature can exclude them rather than trust them.
2. **The cooldown is per (student, quiz) and in-process state is not involved** — it is derived from
   persisted attempt data, so it survives a restart. If it is ever moved to the in-process limiter,
   `ai-tutor-guardrails` S13 §17 (per-process limiter) applies and this note becomes wrong.
3. **A determined student can still guess within the cap.** With four options and three attempts the
   chance of a lucky correct answer is real; the cap makes systematic enumeration impossible, not
   luck. Across every quiz on a lesson the compounding makes fabricated level-3 unlikely rather than
   impossible.
4. **Nothing consumes the promotion event** (`ai-tutor-guardrails` S13 §13, `ai-defence-layers`
   S16 §9). AC 17 builds the signal; there is still no sink. Treat the event as evidence for a later
   investigation, not as detection.
5. **`ai-tutor-guardrails` S13 §11 closes on merge, down to residual 3** — not to zero.
6. **Concept-name collision across lessons** (`ai-tutor-guardrails` S13 §7) is unchanged, but its
   accepted price was "completing the quizzes". This feature restores that price; before it, the
   price was three clicks.

## S11. Out of scope

- **C5 (instructor content length caps)** — separate feature; unrelated to the key.
- **Instructor-facing grading review or export** — no such surface exists today. If the plan wants
  one, it is a deliberate third audience with its own accessor (S3), not a widening of
  `findByLesson`.
- **Reconciling `ConceptMastery` rows against the new cap** — the cap applies going forward.