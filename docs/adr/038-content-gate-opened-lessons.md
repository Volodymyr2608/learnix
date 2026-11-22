# ADR-038: Lesson content reaches a student only from lessons they have opened

- **Status**: Accepted (2026-11-22)
- **Date**: 2026-11
- **Amends**: [ADR-023](023-chat-route-authorization-binding.md) only in what the authorizing statement must
  prove — it now proves the open as well as the enrollment
- **Feature**: `refund-self-service` (FR-P19a, slice 6)
- **Closes**: `ai-tutor-guardrails/security.md` S13 §25 ("RAG scope is the whole course")

## Context

Until now an enrollment granted the whole course to every AI and lesson-derived feature: the tutor's
`search_across_course` returned chunks of any lesson, and the study guide and quizzes were served for
any lesson of an enrolled course. S13 §25 accepted that because nothing inside a course had a price.

The refund feature gives it one. The automatic refund is allowed below a threshold of **opened**
lessons (FR-P19), and an open is recorded only when the lesson page is served. Course-wide retrieval,
a study guide or a quiz for an unopened lesson let a student consume the course with an open count of
zero and still get the automatic refund. No injection is needed — "summarise sections 3 and 4" is a
normal question.

## Decision

1. **One gate.** A student reads lesson-derived content only for lessons with an `OpenedLesson` row
   for that student. It is expressed once, in `server/repositories/contentGate.ts`:
   `lessonOpenedBy(studentId)` (a `where` fragment) and `lessonOpenedSelect(studentId)` (the same
   fact as a `select`, for readers that must tell "not opened" from "missing").
2. **Inside the authorizing statement.** The gate is read in the same query that proves the
   enrollment (ADR-023), never by a second lookup keyed by a request-supplied id. In raw SQL
   (`searchCourseChunks`) it is a `JOIN opened_lessons` on the calling student.
3. **The student id never reaches the model.** Tools take it from their closure; their schemas carry
   no ids.
4. **Refusal shapes.** The tutor returns `403 "Lesson not opened"` before the guard and any model
   call; the study guide returns `null`; quizzes throw `FORBIDDEN "Open the lesson first"`. Each logs
   `lesson_not_opened` (layer `content_gate`), which is not forwarded to Sentry because a direct API
   caller can trigger it at will.
5. **New readers are caught structurally.** `CONTENT_READERS` lists every module that reads lesson
   content, chunks or study guides, with its gate (`opened`, `records-open`, `instructor-only`,
   `scoped-by-caller`, `definition`, `strips-content`). `contentReaders.contract.test.ts` derives
   readers from source — any `content: true` select, any lesson row loaded without a `select`
   (directly or through a `lessons:` relation), any chunk or study-guide read — and fails on an
   unlisted reader, and on an `opened` / `definition` entry whose named function lacks the gate.

## Exceptions

- **Learning-path reasons (AI-C6)** may draw on concept names and summaries of unopened lessons — one
  sentence per step for an enrolled student's path; accepted in the spec.
- **Instructors** are unaffected: their branches are scoped by `instructorId`.
- **Tutor history written before the gate** stays readable (`security.md` AI-C5 residual).

## Consequences

- A tutor question about a later lesson gets "not covered in the lessons opened so far" rather than
  an answer; the tool description says so, so the model does not claim the course lacks the topic.
- The tutor eval cannot exercise the gate (it stubs retrieval), so AC-L2 is proven by a deterministic
  canary integration test over the real tool and SQL (G7).
- Any sequential or drip unlocking added later can reuse the same gate.
- Every new student-facing reader must join the gate; the contract test makes forgetting it a red
  build rather than a review comment.

## Alternatives considered

- **Count derived reads as opens** (a study guide or tutor answer for lesson N records an open of N):
  rejected — it inflates the threshold count with reads the student did not choose, and the tutor
  search touches many lessons per question.
- **Filter tutor output instead of retrieval**: rejected — the text has already reached the model,
  and output filtering of paraphrase is probabilistic.
- **Leave S13 §25 accepted and rely on the refund threshold alone**: rejected — the threshold is
  exactly what course-wide retrieval defeats.
