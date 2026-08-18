---
feature: quiz-answer-key
status: planned
models: [Quiz, QuizAttempt, ConceptMastery]
depends-on: [ai-tutor-guardrails, ai-defence-layers]
---

## Purpose

A student can reach level-3 concept mastery without demonstrating anything, and a *different*
feature's spec depends on that being impossible.

`ai-tutor-guardrails` caps conversation-granted mastery at level 2 (`CONVERSATION_MAX_LEVEL`) on the
stated grounds that level 3 must be "confirmation by action, not by text" — reachable only by
answering every quiz on the lesson correctly. Two things make that argument false today:

1. **The answers ship with the questions.** `quiz.getByLesson` and `lesson.getStudentLesson` both
   return the whole `Quiz` row, `correct` included, to any enrolled student.
2. **Guessing is free.** `quiz.submit` has no attempt cap and no rate limit; a wrong attempt
   overwrites its own row, leaving no record that it happened. Removing the key alone would turn a
   one-request read into a ≤3-request enumeration of a 4-option question — cheaper than learning,
   and indistinguishable afterwards from a first-try correct answer.

`learningPathAI` then reads the inflated `ConceptMastery` rows and stops recommending review, so
fabricated mastery decides what the platform teaches next. Neither exposure is an attack on the
platform: nobody decided students should see `correct`, and nobody decided guessing should be
unlimited.

## Functional scope

**1. `correct` never reaches a student.** The field is loaded only where it is graded.
`quizRepository.findByLesson` selects an explicit field list without `correct`; its three callers
(`quiz.getByLesson`, `promoteConceptsIfLessonComplete`, `getExistingQuizzes.tool`) need `id`,
`question`, `options` and `lessonId` and nothing else. `lessonService.getStudentLesson` selects its
nested `quizzes` fields explicitly rather than including the relation whole.

Grading is unaffected because `quiz.submit` reads the full row through a different method,
`quizRepository.findOne`.

**2. No student-facing type claims the field exists.** `lessonService` returns the inferred narrowed
type; the `as typeof lesson & { quizzes: Quiz[] }` casts are removed. A student component that
reaches for `quiz.correct` fails `pnpm typecheck` instead of reading `undefined` at runtime.

**3. Guessing is bounded.** A quiz allows `min(3, options.length - 1)` graded attempts per student —
always fewer than the number of options, so exhausting the option set cannot produce a correct
answer. `QuizAttempt` records `attemptCount`, so a brute-force run is visible in the record rather
than overwritten by its own last attempt.

**4. Exhausting the cap starts a 24-hour cooldown**, after which the counter resets and the student
may try again. A student who genuinely misunderstood the lesson is not permanently denied level 3;
a student cycling options is slowed to a rate at which the attempt record is the signal.

**5. The correct answer is never revealed to a student, at any point** — not after a wrong attempt,
not after a correct one, not after the cooldown.

**6. Level-3 promotion validates its input to the same standard as the level-2 tool path.** Concept
names from `lessonInsights.concepts` are trimmed, deduplicated case-insensitively and bounded at 80
characters before reaching `ConceptMastery`, matching `markConceptUnderstood`'s schema. A promotion
emits a structured event.

**7. Mastery provenance is recorded.** `ConceptMastery` carries whether a level-3 row was written
before or after this change, because a future certificate or public profile must be able to tell.

**8. Instructor paths are unchanged.** `lesson.getLesson`, `lesson.updateLessonContent`, the preview
page, `GenerateQuizDialog` and `LessonContentEditor` all keep `correct`. The split is by audience.

## Acceptance criteria

**The answer key leaves the student surface**

1. `quiz.getByLesson` returns no `correct` field, asserted on the superjson-serialised response.
2. `lesson.getStudentLesson` returns no `correct` on any nested quiz, asserted the same way.
3. A test enumerates every `studentProcedure` in `server/api/root.ts`, invokes each with a seeded
   enrolled student against a lesson carrying quizzes, and deep-walks the serialised result for a key
   named `correct` at any depth. Key presence, not text search — so `analytics`' `correct` *count* is
   not a false positive and a future nested `include` is not a false negative.
4. `quizRepository.findByLesson` selects `{ id, question, options, lessonId, deletedAt }` explicitly;
   a repository test asserts the returned object's own keys. `correct` is never loaded, so it cannot
   be spread, logged, or re-exposed by a future caller.
5. `lessonService.getStudentLesson` contains no `as … & { quizzes: Quiz[] }` cast, and a student
   component referencing `quiz.correct` fails `pnpm typecheck`.
6. `quiz.submit` still grades correctly via `findOne`; a test asserts `findByLesson` is not called on
   the submit path.

**Guessing is bounded**

7. A quiz permits at most `min(3, options.length - 1)` graded attempts per student. With four
   options and no knowledge of the answer, a client submitting each option in turn cannot obtain
   `isCorrect: true`, and `promoteConceptsIfLessonComplete` does not fire.
8. `QuizAttempt.attemptCount` increments on each graded retry: three wrong submissions then one
   correct yields `{ attemptCount: 4, isCorrect: true }`.
9. Exceeding the cap rejects with a typed error, records no further attempt, and starts a 24-hour
   cooldown; after the cooldown the student may attempt again and the counter resets.
10. `quiz.submit` is rate-limited per `(userId, quizId)`; submissions past the window are rejected
    before reaching `quizRepository`.
11. A student who answers wrongly within the cap still retries normally and still receives no
    `correct` on the retry response.

**The guarantee this restores**

12. No student-reachable response contains the answer key, **and** level 3 cannot be reached by
    exhausting the option set: with the key removed and the cap in place, a student who does not know
    the answer cannot produce a correct attempt on every quiz of a lesson.
13. `QUIZ_MASTERY_LEVEL` and `CONVERSATION_MAX_LEVEL` are named constants in one module, and a test
    asserts `promoteConceptsIfLessonComplete` writes exactly `QUIZ_MASTERY_LEVEL` and that
    `QUIZ_MASTERY_LEVEL > CONVERSATION_MAX_LEVEL`.
14. Submitting every quiz on a lesson correctly still promotes to level 3, asserted end to end
    through `quiz.submit`, including a lesson with a soft-deleted quiz that must not count toward
    `quizzes.length`.
15. `getByLesson`'s quiz↔attempt pairing survives, asserted against a lesson with ≥3 quizzes whose
    ids do not sort in creation order.

**Promotion hygiene and provenance**

16. Concept names are trimmed, deduplicated case-insensitively and rejected above 80 characters
    before `upsertMastery`. An insights blob containing `"  Recursion "`, `"recursion"` and an
    81-character name produces exactly one row, for the canonical `"Recursion"`.
17. A level-3 promotion emits one structured event per batch — six fields, no free text, no concept
    string — and none when `correctCount < quizzes.length`.
18. `ConceptMastery` records level-3 provenance, so a row written before this change is
    distinguishable from one written after. The pre-change population is counted and the number
    recorded in `security.md`.

**The AI path stays closed**

19. No quiz field other than `question` reaches a model or an embedding. A test enumerates every
    `tool(` definition and every embedding source builder and asserts none projects `correct` or
    `options`.
20. `get_existing_quizzes` returns questions only, asserted against a fixture quiz whose `correct` is
    a distinctive sentinel that must not appear in the output.
21. The `ai-defence-layers` conformance matrix drops quizAI's C4 exception — legitimate only because
    AC 19 and 20 exist, so the claim rests on a test rather than on an absence of code.

**Hygiene**

22. `quizService.submit` rejects a submission for a soft-deleted quiz.

## Security

Complex tier: threat pass output, decision record and accepted risks live in
[`security.md`](./security.md). An ADR is required at the `/qa` gate.

## Agent notes

- **Removing the key without the cap is worse than not shipping.** It converts a read into an
  enumeration and would let the conformance matrix drop quizAI's C4 exception on a guarantee that is
  still false. AC 12 is the claim; AC 7–10 are what make it true. Do not land the first half alone.
- **The student UI never needed the field.** `QuestionCard` and `optionClassName` derive everything
  from `attempt`. A student component reaching for `quiz.correct` is the signal the leak is being
  reintroduced — after AC 5 it will not typecheck.
- **Grading was already server-side.** The source review (C4) says to "grade server-side"; that is
  wrong about the current code. `quiz.submit` has always compared server-side. What changes is what
  the *read* returns.
- **`orderBy: { id: "asc" }` is load-bearing.** `getByLesson` pairs `quizzes[i]` with `attempts[i]`
  positionally. A projection change that touches ordering shows a student the wrong attempt state.
- **The level-3 write path validated less than the level-2 one.** `toolPolicy` guards a level-2 write
  with an allowlist, a ceiling, canonicalisation and a length bound; `promoteConceptsIfLessonComplete`
  wrote level 3 from unschema'd model JSON after one `typeof` check. AC 16 closes the asymmetry — the
  higher authority should not be the looser path.
- **The reason this is worth doing is in another feature's spec.** Read `ai-tutor-guardrails`' level-3
  argument first; the value of the change is that the argument stops being false.