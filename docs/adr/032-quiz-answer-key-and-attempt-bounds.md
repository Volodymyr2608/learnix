# ADR-032: Level 3 means something — remove the answer key and bound guessing together

- **Status**: Accepted
- **Date**: 2026-08-28

## Context

[ADR-024](024-lesson-tutor-authority-boundaries.md) lets the lesson tutor write `ConceptMastery`
levels 0–2 and caps it there, on a stated ground: level 3 is "confirmation by action, not by text",
reachable only by answering every quiz on the lesson correctly. `learningPathAI` then reads those
rows and stops recommending what a student has mastered, so the ceiling is not decorative — it
decides what the platform teaches next.

Two facts made that argument false, both found in the 2026-08-16 AI content supply-chain review as
finding C4.

1. **The answers shipped with the questions.** `quiz.getByLesson` and `lesson.getStudentLesson`
   both returned the whole `Quiz` row, `correct` included, to any enrolled student. Nobody decided
   this; the read was written before there was an audience distinction to make.
2. **Guessing was free.** `quiz.submit` had no attempt cap and no rate limit, and a wrong attempt
   overwrote its own row — so a brute-force run left a record indistinguishable from a first-try
   correct answer.

The second fact is why this ADR exists at all. Removing the key alone converts a one-request read
into a ≤3-request enumeration of a four-option question: still cheaper than learning, and now
*invisible*, because the platform would look fixed. The `ai-defence-layers` conformance matrix would
have dropped quizAI's C4 exception on a guarantee that was still false — the failure mode that
matrix exists to prevent, one level up.

## Decision

### 1. The audience split is a projection at the repository, not a branch in the service

`quizRepository.findByLesson` selects `{ id, question, options, lessonId, deletedAt }`. The key is
never loaded, so it cannot be spread into a response, written to a log line, or re-exposed by a
caller added later. Grading reads the whole row through `findOne` — a different method, unaffected.

A third audience gets a **deliberate accessor**, never a flag: `findByLessonForAuthor` returns the
whole row for the instructor who owns the lesson, and its one caller verifies ownership first. The
audience is then chosen at the call site and visible in review, where a boolean argument would be one
typo away from handing a student the key.

The `as typeof lesson & { quizzes: Quiz[] }` cast in `getStudentLesson` is gone. With it, narrowing
the projection underneath would have left TypeScript asserting `quiz.correct: string` on a
student-facing value — a component reading `undefined` at runtime, whose plausible fix is to put the
field back. A `@ts-expect-error` in the test now fails the build if the key becomes reachable again.

### 2. The cap lives inside the statement that writes the attempt

A quiz allows `min(3, options.length − 1)` graded attempts per student — always below the option
count, so a client runs out of attempts before it runs out of options and cannot arrive at the answer
by elimination inside one window. The window is rolling: 24 hours after the last graded attempt it
restarts.

**Two counters, not one.** `windowCount` is what the cap compares against and what the window
restarts; `attemptCount` counts a lifetime and nothing resets it. The first implementation used one
column for both, and the audit at `/qa` found what that costs: a student could spend three attempts,
wait a day, submit the one remaining option, and be recorded as `QUIZ_FIRST_PASS` — the strongest
provenance marker in the enum, for an answer reached purely by elimination. A cap that resets is a
cap; a *record* that resets is a false record.

Both are predicates inside one `INSERT … ON CONFLICT DO UPDATE`. A check in the service would be
read-then-write: ten parallel submissions would all read the same pre-attempt count and all be
recorded, which defeats the cap exactly when someone is trying to. The cooldown is derived from the
attempt row's `updatedAt` rather than from in-process state, so it survives a restart and does not
depend on which instance serves the request.

Making the statement the enforcement made "zero rows returned" ambiguous, so the repository names its
outcome — `recorded`, `already_correct`, `capped`. `already_correct` and `capped` are different
answers to the student and only one of them is an error.

### 3. `attemptCount IS NULL` means unknown, and is never invented

Rows that predate the counter carry NULL. They are **not** backfilled from `count(*)`: the old code
overwrote the attempt row in place, so `count(*)` is 1 for a quiz retried twenty times. That backfill
looks free and truthful and is a fabrication.

Its *window*, though, is knowable from the first post-change attempt, so such a row is capped like
any other while its lifetime count stays NULL — which is what a promotion turns into `LEGACY`. The
unknown rides in the label rather than in a fabricated number.

### 4. Provenance is a column, because a credential is coming

`ConceptMastery.evidence` records how a level was earned: `CONVERSATION`, `QUIZ_FIRST_PASS`,
`QUIZ_RETRIED`, `LEGACY`. NULL means "written before this column existed" — the pre-change population,
isolated by `level = 3 AND evidence IS NULL` with no deploy timestamp to remember.

Existing rows are **left in place**. Attribution is impossible — a network-tab reader and a competent
student are indistinguishable in the data — and downgrading real achievement to erase a hypothetical
is the worse error. Identification is free and was not skipped.

Provenance follows the level on the same condition the level does: a conversation write over a
quiz-earned row changes neither, and a pre-change NULL is never given a story it did not earn.

`QUIZ_RETRIED` was not in the design pass. Without it a promotion where a quiz took two attempts had
to be recorded as `QUIZ_FIRST_PASS` — the column asserting something the attempt rows contradict,
which is the opposite of what provenance is for.

### 5. The guarantee is a test, and the exclusion is narrowed rather than dropped

`answerKeyGuarantee.integration.test.ts` runs the whole story: an attacker reads every response the
lesson offers, finds no key, spends every attempt the cap allows in option order, and ends with no
mastery row — while a student who knows the answers still reaches level 3. Lifting either half turns
it red.

quizAI's conformance `exclusions` entry keeps its second claim. C4 is two claims, and this feature
answers one: the key can no longer reach a student or a model, pinned by tests rather than by an
absence of code. The key is still **model-authored** — a poisoned lesson can steer which option is
marked correct, and no layer checks that. Deleting the whole entry would certify a guarantee this
feature does not deliver.

## Consequences

**A student who genuinely misunderstands is slowed, not locked out.** Three attempts, then a day.
That is a real cost paid by honest students on hard questions, accepted because the alternative — the
guarantee level 3 rests on — is worth more than the inconvenience.

**A lucky guess inside the cap is still possible, and so is patience.** With four options and three
attempts the chance of a lucky answer is real, and a student who waits out the window can try the
remaining option the next day. The cap does not make fabricated level-3 impossible; what the split
counters buy is that it is never *silent* — a cross-window answer records as `QUIZ_RETRIED` with the
real attempt count, and the guarantee test pins that it can never read as a first pass. Recorded as
an accepted residual (`security.md` S10 item 3), not as a solved problem.

**Editing a lesson's questions no longer erases its attempt history.** `replaceForLesson`
hard-deleted, and `QuizAttempt` cascades — so saving the quiz tab reset every student's cap and
cooldown and destroyed the rows a level-3 `evidence` value points at. It soft-deletes now.

**Two migrations, one of them irreversible.** The dedupe collapses pre-existing duplicate
`(quizId, studentId)` pairs — a correct attempt outranks a wrong one, then the newest, then the
highest id — archiving the losing rows in the same statement that deletes them. Its ranking is
replayed against a clone table in the test *by reading the migration file*, so editing the `ORDER BY`
turns the test red rather than silently changing which row survives.

**The promotion event has no sink.** `mastery_promoted` is evidence for a later investigation, not
detection, and should not be described as the latter.

**`ai-tutor-guardrails` items 12–15 are unblocked.** They inherit `attemptCount`, the cap and the
`evidence` column rather than re-deriving them, and extend the enum with `APPLIED_CHECK`.

## Alternatives considered

**Remove the key, ship the cap later.** Rejected as worse than shipping nothing: it converts a read
into an enumeration while letting the conformance matrix certify a guarantee that is still false. The
implementation order deliberately lands the cap first, so the safe partial state is "key visible,
guessing bounded" rather than the reverse.

**Branch on role inside `getStudentLesson`.** Rejected. Two audiences in one function drift, and the
third audience — grading review, admin export — arrives as an `if` rather than as a decision.

**Reveal the correct answer after a wrong attempt**, as many quiz products do. Rejected: it re-opens
the bypass through a friendlier door. After a correct answer it is merely redundant.

**Delete or downgrade existing level-3 rows.** Rejected — see decision 4. The cutoff column bounds
them instead, so a future credentialing consumer can exclude rather than trust them.

**One attempt counter, with the cooldown resetting it.** Rejected at `/qa`, having been built and
audited: the cap's window and the record's lifetime are different questions, and the column that
answers both answers the second one wrongly the moment a window turns over.

**Route `quiz.submit` through the existing `aiRateLimit` middleware.** Rejected: submitting a quiz is
not a model call, and spending a student's tutor allowance on it is the defect
`ai-tutor-guardrails` S13 §17/§31 already records. It gets a non-AI window on the same store, in a key
segment no `AiFeature` name can occupy — two windows, in fact: per `(user, quiz)` and per user, since
`quizId` comes from the request and a client sweeping ids would otherwise get a fresh budget every
time.

## References

- [`docs/specs/features/quiz-answer-key/spec.md`](../specs/features/quiz-answer-key/spec.md) —
  acceptance criteria
- [`docs/specs/features/quiz-answer-key/security.md`](../specs/features/quiz-answer-key/security.md) —
  design-time threat pass, decisions D-A..D-G, accepted residuals
- [ADR-024](024-lesson-tutor-authority-boundaries.md) — the level-2 ceiling this feature makes
  meaningful
- [ADR-017](017-owasp-security-rules.md) — the OWASP rules this projection change answers to
- [`docs/ai-defence/findings-register.md`](../ai-defence/findings-register.md) — finding C4
