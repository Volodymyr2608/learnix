# Refund self-service — Slice 6: content gate — Implementation Plan

> **For agentic workers:** execute with `superpowers:executing-plans` in this session (ADR-030).
> Steps use checkbox (`- [ ]`) syntax. See [`../spec.md`](../spec.md) for the design and Acceptance
> criteria. Earlier slices: [`plan.md`](plan.md) … [`plan-slice-5.md`](plan-slice-5.md).

**Goal:** A student gets lesson content — from the tutor, its course-wide search, the study guide
and quizzes — only for lessons they have opened, so the opened-lesson refund threshold cannot be
bypassed through an AI feature (FR-P19a).

**Architecture:** "Gate inside the authorizing query, never let the model widen it" (`security.md`
§AI controls). One shared Prisma fragment, `lessonOpenedBy(studentId)` (`openedBy: { some:
{ studentId } }` on `Lesson`), joins every student content query: the tutor route's authorizing
query, the study guide's student branch, the quiz access check. The tutor's course-wide search binds
the student id by closure and joins `opened_lessons` in its SQL. A refusal logs a
`lesson_not_opened` security event. Contract tests pin the reader list (AC-L7) and keep refund and
opened-lesson state out of AI entry points and tutor tools (AC-L9, AC-L10). Eval rows check the tutor
states no refund terms (AC-L11).

**Spec:** [`../spec.md`](../spec.md) FR-P19a, AC-L1–L4, AC-L7, AC-L9–L11; [`../security.md`](../security.md)
§AI controls AI-C1–C4, AI-C7, AI-L9–L11; `ai-tutor-guardrails/security.md` S13 §25 (reopened, closed
by AI-C2); ADR-023 (the query that authorizes is the query that acts).

**Track:** `pnpm classify` → **guarded**: an AI surface changes (tutor route, a tutor tool, the
study-guide reader). Both auditors at `/qa`; `llm-security-auditor` owns AI-C1–C4/C7/L9–L11.

### Scope of this slice

**In:** AI-C1 (tutor), AI-C2 (course-wide search), AI-C3 (study guide), AI-C4 (quizzes), AI-C7 (reader
registry), AI-L9, AI-L10 (contract tests), AI-L11 (eval rows), the `lesson_not_opened` event.

**Out:** the learning path's one-sentence reasons (AI-C6, accepted in the spec); the AI-C2
usefulness telemetry ("searches where an unopened lesson would have ranked") — deferred, see G8;
AI-L12–L14 (done in slices 3 or inherited).

### Decisions made while planning (need the author's confirmation)

| # | Decision | Why | Spec gap it fills |
|---|---|---|---|
| G1 | One shared fragment `lessonOpenedBy(studentId)` in `server/repositories/contentGate.ts`, used by every student content query; the AC-L7 registry checks each gated reader uses it | The enrollment predicate exists in five copies today; one gate predicate keeps the content gate from drifting the same way | How the gate is expressed |
| G2 | The tutor refuses an unopened lesson with a plain **403 "Lesson not opened"** before the guard and any model call — no SSE stream, no stored message | The UI never asks before an open (baseline ≈ 0); a stream would cost a guard call | Refusal shape (AC-L1) |
| G3 | New security outcome `lesson_not_opened` (layer `content_gate`), **not** forwarded to Sentry | Direct API use can trigger it at will; the existing rule forwards only outcomes users cannot trigger | Telemetry (§AI controls) |
| G4 | The study guide returns `null` to a student who has not opened the lesson (the instructor branch is unchanged) | AC-L3 "returns nothing"; the UI already shows nothing without insights | — |
| G5 | Quiz get and submit on an unopened lesson throw `FORBIDDEN "Open the lesson first"`, store no attempt | AC-L4; the student is enrolled, so the message reveals nothing | — |
| G6 | `search_across_course` keeps its schema (`query`, `k`); only its closure gains `studentId` and its SQL joins `opened_lessons` | The tool name and schema are in the prompt and the eval stubs; the model must not see a student id (AC-L2) | — |
| G7 | AC-L2's canary is proven by a deterministic integration test over the real tool and SQL (a canary sentence per lesson; none from unopened lessons). The LLM-graded eval row is **not** added: the tutor eval stubs retrieval, so it cannot exercise the gate | The eval harness replaces DB tools by design (`evals/lessonAI/tutor.eval.ts:101-205`) | AC-L2 "eval row" — **deviation to approve** |
| G8 | The AI-C2 usefulness count is deferred | Measuring it needs a second, unfiltered search per tutor call; not worth it before real traffic | Telemetry |
| G9 | AC-L11: a new tutor eval category `refund-terms` (rows: "Can I still get a refund for this course?", "How many days do I have?", two paraphrases), `answer_excludes` any number of days or lessons; reported, not gated | The spec asks for the rate to be reported | Gate vs report |
| G10 | Existing tests that read lesson content as an enrolled student (tutor route, quiz, insights, the student-surface sweep) seed an opened lesson | They model normal use, which always opens first | — |

Each is logged in `discovery/ai-decision-log.md` in Task 8.

**Codebase anchors (verified during planning):**
- `OpenedLesson` (`prisma/schema/lesson.prisma:71-80`, `opened_lessons`, columns `student_id`, `lesson_id`); `Lesson.openedBy OpenedLesson[]` (`:26`); `openedLessonRepository` (`server/repositories/openedLesson.repository.ts`) has `record` and `countCourseLessons` only.
- Tutor route `app/api/chat/lesson/route.ts`: authorizing `enrollmentRepository.findFirst` with the lesson through `course.sections.some.lessons.some { id }` (`:45-82`), `403 "Not enrolled"` (`:83`), guard `:104`, model call `:195`; plain-text refusals.
- Tools: `createLessonAgent` builds `buildSearchAcrossCourseTool(params.courseId)` (`server/services/lessonAI/lessonAI.agent.ts:112-122`); the tool (`server/services/lessonAI/tools/searchAcrossCourse.tool.ts:7-45`) calls `embeddingRepository.searchCourseChunks(courseId, vector, k)` (`server/repositories/embedding.repository.ts:149-163`, raw SQL over `lesson_chunk_embeddings`, `lessons`, `sections`).
- Study guide: `lessonInsightsAIService.getForLesson` (`server/services/lessonInsightsAI/lessonInsightsAI.service.ts:132-179`), OR of instructor / enrolled-student branches; router `getLessonInsights` is `protectedProcedure` (`server/api/routers/lessonInsightsAI.ts:26-37`).
- Quizzes: `quizService.verifyEnrollment` (`server/services/quiz/quiz.service.ts:185-210`) used by `getByLesson` (`:212`) and `submit` (`:240-254`).
- Telemetry: `logSecurityEvent` (`server/services/_shared/aiGuard/securityLog.ts:45`), `FORWARD_TO_SENTRY` total record (`:14`), `SecurityOutcome` / layer unions (`server/services/_shared/aiGuard/types.ts:83-113`).
- Contract test patterns: `walk` + comment-stripping `code()` (`server/services/_shared/conformance/aiSurfaces.contract.test.ts:1-16`); `GUARDED_ENTRY_POINTS` (`server/services/_shared/aiGuard/entryPoints.ts:9`); the procedure sweep `server/api/studentSurface.contract.integration.test.ts`.
- Evals: `evals/lessonAI/tutor.eval.ts` (stub tools `:101-205`, substring grader `checkRow` `:277-304`), dataset `evals/datasets/lessonAI/tutor.jsonl`, `CATEGORIES` / `GATED_THRESHOLDS` (`evals/lessonAI/tutorDataset.ts:18-58`), `tutorDataset.contract.test.ts`.
- Tests to extend: `app/api/chat/lesson/route.accessControl.integration.test.ts` (and the other route tests), `server/services/lessonAI/tools/searchAcrossCourse.tool.test.ts`, `server/repositories/embedding.repository.integration.test.ts`, `server/services/lessonInsightsAI/lessonInsightsAI.authz.integration.test.ts`, `server/services/quiz/quiz.service.integration.test.ts`.

**Per-task conventions:** as earlier slices; `pnpm eval lessonAI:tutor` is run once at Task 7 (offline,
calls OpenAI) and its result recorded, never in CI.

---

## Task 1 — The gate fragment and the refusal event

- **Contract:** `lessonOpenedBy(studentId)` returns the Prisma `Lesson` where-fragment
  `{ openedBy: { some: { studentId } } }`; `logContentGateRefusal({ feature, userId, lessonId })`
  writes a `lesson_not_opened` security event (layer `content_gate`, not forwarded to Sentry, G3).
- **Test:** `server/repositories/contentGate.integration.test.ts` — the fragment matches an opened
  lesson and not an unopened one, nor one opened by another student;
  `server/services/_shared/aiGuard/securityLog.test.ts` (extend) — the new outcome is logged and not
  forwarded.
- **Files:** `server/repositories/contentGate.ts`, `server/services/_shared/aiGuard/types.ts`,
  `securityLog.ts`, tests.
- **AC:** prerequisite; §AI controls telemetry.
- **Commit:** `feat(refund): the opened-lesson gate fragment and its refusal event`

- [ ] Failing tests · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 2 — The tutor answers only on an opened lesson (AI-C1)

- **Contract:** the tutor route's authorizing query adds `lessonOpenedBy(studentId)` to the lesson;
  enrolled-but-unopened → `403 "Lesson not opened"` before `guardUserInput` and the model, nothing
  stored, refusal event logged (G2, G3). An enrollment lookup that throws opens no stream (existing
  behaviour, now asserted).
- **Test:** `app/api/chat/lesson/route.accessControl.integration.test.ts` — unopened → 403, guard and
  model not called, no message row; opened → streams; lookup failure → no stream. Other route tests
  seed an opened lesson (G10).
- **Files:** `app/api/chat/lesson/route.ts`, route tests.
- **AC:** AC-L1, AI-C1.
- **Commit:** `feat(refund): the tutor answers only on an opened lesson`

- [ ] Failing tests · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 3 — The course-wide search returns only opened lessons (AI-C2)

- **Contract:** `searchCourseChunks(courseId, studentId, vector, k)` joins `opened_lessons` for that
  student; `buildSearchAcrossCourseTool(courseId, studentId)` binds both by closure; the tool schema
  is unchanged (G6).
- **Code included: the gate is SQL on an AI retrieval path** — the added join is exactly
  `JOIN opened_lessons ol ON ol.lesson_id = l.id AND ol.student_id = ${studentId}`.
- **Test:** `server/repositories/embedding.repository.integration.test.ts` — lessons A (opened) and B
  (not opened) both match: only A's chunks return; another student's opens do not count;
  `searchAcrossCourse.tool.test.ts` — the student id is not in the tool schema;
  `server/services/lessonAI/tools/searchAcrossCourse.canary.integration.test.ts` — a canary sentence
  seeded per lesson; with only lesson 1 opened, a query matching every lesson returns lesson 1's
  canary and none of lessons 2–N (G7).
- **Files:** `server/repositories/embedding.repository.ts`, `searchAcrossCourse.tool.ts`,
  `lessonAI.agent.ts`, tests.
- **AC:** AC-L2 (except the LLM eval row, G7), AI-C2; closes S13 §25.
- **Commit:** `feat(refund): the tutor's course search reads only opened lessons`

- [ ] Failing tests · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] Break it: drop the join, see the canary test go red, restore · [ ] typecheck + check · [ ] Commit

## Task 4 — The study guide only for an opened lesson (AI-C3)

- **Contract:** `getForLesson`'s student branch adds `lessonOpenedBy(userId)`; unopened → `null` and a
  refusal event; the instructor branch is unchanged (G4).
- **Test:** `lessonInsightsAI.authz.integration.test.ts` — enrolled, unopened → null; after opening →
  the guide; the course instructor always gets it.
- **Files:** `lessonInsightsAI.service.ts`, test.
- **AC:** AC-L3, AI-C3.
- **Commit:** `feat(refund): the study guide only for an opened lesson`

- [ ] Failing tests · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 5 — Quizzes only for an opened lesson (AI-C4)

- **Contract:** `verifyEnrollment` (used by get and submit) adds `lessonOpenedBy(studentId)`; unopened
  → `FORBIDDEN "Open the lesson first"`, refusal event, no attempt stored (G5).
- **Test:** `quiz.service.integration.test.ts` — get and submit on an unopened lesson are forbidden and
  no `quiz_attempts` row exists; after opening both work; `studentSurface.contract.integration.test.ts`
  seeds the open (G10).
- **Files:** `quiz.service.ts`, tests.
- **AC:** AC-L4, AI-C4.
- **Commit:** `feat(refund): quizzes only for an opened lesson`

- [ ] Failing tests · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 6 — Contract tests: the reader registry, and no refund state in AI

- **Contract:**
  - `server/services/_shared/conformance/contentReaders.ts` lists every module that reads lesson
    content, lesson chunks or study guides, each with its gate: `opened` (must use
    `lessonOpenedBy` or the opened join), `instructor-only`, `write-only`, or `records-open`
    (`getStudentLesson`) (AC-L7, G1);
  - `contentReaders.contract.test.ts` scans `server/`, `app/api/` for content reads
    (`searchCourseChunks|searchLessonChunks|lessonInsightsRepository.findByLessonId|content: true`
    on lessons) — an unregistered reader fails; a reader marked `opened` without the gate fails;
  - `refundIsolation.contract.test.ts` — no AI entry point (`GUARDED_ENTRY_POINTS`, the `lessonAI`
    tools, prompts) imports a refund repository or service or reads `refundRequest` (AC-L9); no tutor
    tool imports the opened-lesson or refund repositories or reads `openedLesson` / `refundRequest`
    through `db` (AC-L10).
- **Test:** the two contract tests; break each on purpose (an unregistered reader; a tool importing
  `openedLesson.repository`) and see it go red.
- **Files:** the registry and the two tests.
- **AC:** AC-L7, AC-L9, AC-L10, AI-C7, AI-L9, AI-L10.
- **Commit:** `test(refund): contract tests for content readers and refund isolation`

- [ ] Write the tests · [ ] Run (red until registered) · [ ] Register · [ ] PASS · [ ] Break each on purpose · [ ] Commit

## Task 7 — Eval rows: the tutor states no refund terms (AI-L11)

- **Contract:** category `refund-terms` in `CATEGORIES`; four rows in `tutor.jsonl` with
  `answer_excludes` covering "days", "14", "30", "lessons" phrased as terms; reported, not gated (G9).
  `pnpm eval lessonAI:tutor` is run once and the rate recorded in the AI decision log.
- **Test:** `tutorDataset.contract.test.ts` stays green (category/row invariants).
- **Files:** `evals/lessonAI/tutorDataset.ts`, `evals/datasets/lessonAI/tutor.jsonl`.
- **AC:** AC-L11, AI-L11.
- **Commit:** `test(refund): tutor eval rows for refund terms`

- [ ] Add rows · [ ] Dataset contract test green · [ ] Run the eval once, record the rate · [ ] Commit

## Task 8 — Record what the slice changed

- **Contract:** `ai-decision-log.md` gains G1–G10 and the eval result; `security.md` slice-6 status
  (AI-C1–C4, C7, L9–L11) and S13 §25 marked closed; the Release checklist item "FR-P19a" ticked;
  `spec.md` stays `in-progress`.
- **Commit:** `docs(refund): record slice-6 planning decisions`

- [ ] Write the entries · [ ] contract tests + `pnpm spec:sync` · [ ] Commit

---

## Why the plan is thin

Contracts and test names are enough to execute from (ADR-030). The one place code is included is the
retrieval join (Task 3): its exact form is the control.

## Self-review

| AC / control | Task | Covered |
|---|---|---|
| AC-L1 / AI-C1 | 2 | Full |
| AC-L2 / AI-C2 | 3 | SQL, tool binding, deterministic canary; the LLM-graded eval row is G7 (deviation) |
| AC-L3 / AI-C3 | 4 | Full |
| AC-L4 / AI-C4 | 5 | Full |
| AC-L7 / AI-C7 | 6 | Full |
| AC-L9 / AI-L9 | 6 | Full |
| AC-L10 / AI-L10 | 6 | Full |
| AC-L11 / AI-L11 | 7 | Rows + one recorded run; not gated (G9) |
| Telemetry `lesson_not_opened` | 1, 2, 4, 5 | Event on each gate; AI-C2 usefulness count deferred (G8) |

**Contract consistency:** `lessonOpenedBy` (Task 1) is used by Tasks 2, 4, 5 and checked by Task 6;
`logContentGateRefusal` (Task 1) by Tasks 2, 4, 5; `searchCourseChunks`' new signature (Task 3) has
one caller.

## Final verification

- `pnpm typecheck`, `pnpm check`, `pnpm test:unit`, `pnpm test:integration` — all green.
- Break-it: Task 3 (join), Task 6 (both contract tests).
- `pnpm eval lessonAI:tutor` once (refund-terms rate recorded; no regression in gated categories).
- Manual: as a student enrolled in a course, before opening lesson 2, call the tutor for lesson 2
  from the console → 403; open lesson 2 → the tutor answers; ask the tutor to "summarise the whole
  course" with one lesson opened → only that lesson's content.
