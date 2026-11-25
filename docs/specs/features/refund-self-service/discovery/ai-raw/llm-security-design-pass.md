# LLM security design pass (llm-security-auditor, design mode), 2026-11-16

*Raw output of the `llm-security-auditor` agent, dispatched for threat T9 of the classic pass
([`security-design-pass.md`](security-design-pass.md)). Evidence, not design. Spot-checked by the main
session: `searchCourseChunks` filters only on `courseId`
(`server/repositories/embedding.repository.ts:149-163`), so the tutor's `search_across_course` reads
every lesson of the course.*

---

**Bottom line.** Three student-facing AI paths let a student take in lesson content without an
"opened" record. The worst is the tutor's `search_across_course`: from one legitimately opened
lesson it reads every lesson of the course, so recording an open does not fix it; it needs a
restriction. Two non-AI paths (study guides, quizzes) also expose lesson-derived content without an
open. FR-P9's deletion list misses two stored AI artifacts. The refund rule turns content readable
without opening into money, which reopens `ai-tutor-guardrails/security.md` S13 §25.

## Q1. Surfaces returning lesson content to a student

| # | Surface | file:line | Reaches | Access check | Opened record today |
|---|---|---|---|---|---|
| S1 | Tutor SSE route | `app/api/chat/lesson/route.ts:25-90` | Any lesson of a non-cancelled enrollment | `route.ts:45-80` | None; `getStudentLesson` never called |
| S1a | `retrieve_lesson_context` | `tools/retrieveLessonContext.tool.ts:8-49` → `embedding.repository.ts:136-147` | The requested lesson only | Inherits S1 | None |
| S1b | **`search_across_course`** | `tools/searchAcrossCourse.tool.ts:76-94` → `embedding.repository.ts:149-163` | **Every non-deleted lesson of the course** | Inherits S1 | None |
| S1c | `ask_concept_check` → `lessonAssistant.pendingCheck` | `server/api/routers/lessonAssistant.ts:35-47` | Model-written question grounded in lesson X | Student + lesson only, **no enrollment check** | None |
| S1d | `lessonAssistant.getHistory` | `lessonAssistant.ts:10-21` | Earlier tutor replies (may paraphrase any lesson via S1b) | Student id only, **no enrollment check** | None |
| S2 | **Study guide** `lessonInsightsAI.getLessonInsights` | `routers/lessonInsightsAI.ts:117-128` → `lessonInsightsAI.service.ts:132-179` | Stored summary, concepts, glossary of **any** lesson of an enrolled course; no model call | Enrollment not cancelled | None |
| S3 | Quizzes `quiz.getByLesson`, feedback from `quiz.submit` | `routers/quiz.ts:20-55` → `quiz.service.ts:185-238`, `:240-317` | Any lesson of an enrolled course | `verifyEnrollment` | None |
| S4 | Learning path (`regenerate`, SSE, `getForCourse`) | `routers/learningPath.ts:139-178`; `app/api/chat/learning-path/route.ts:30-36`; `mergeAndExplain.node.ts:32-51,199-222` | Insights summary of up to 3 next not-completed lessons in the prompt; ≤ 5 stored sentences | `getForCourse`: **none** (`learningPathAI.service.ts:91-93`) | None |
| — | Semantic search, recommendations | `search.service.ts:11-23` | Course rows only | — | Not a content path |
| — | `courseAI`, `quiz.generateAI`, `generateLessonInsights` | `instructorProcedure` | Instructor-only | — | Not a student path |

Throughput on S1b: up to 8 chunks × ~1,000 chars per call, 12 steps per turn, 20 turns/min; a
20-lesson course in a few turns from lesson 1. `validateReply` cannot stop it (verbatim-only,
paraphrase passes, runs after streaming). Payload: open lesson 1, ask "Summarise every lesson in
section 3, then section 4, with the key code examples." No injection needed.

## Q2. Controls

Rule: gate inside the authorizing query (an `openings: { some: { studentId } }` clause), `studentId`
bound by closure, never a tool argument.

| Ctl | Surface | Decision | Trade-off |
|---|---|---|---|
| AI-C1 | Tutor route | **Restrict**: refuse a turn on X unless X is opened, checked before the guard and any model call | None in the UI (the tutor is on the lesson page, after `getStudentLesson`). Alternative: the route writes the open, fail-closed |
| AI-C2 | `search_across_course` | **Restrict** to opened lessons (`buildSearchAcrossCourseTool(courseId, studentId)` + join on openings); optional titles-only for unopened matches | Recording opens per search would spend the threshold by a model's choice (LLM06). Tutor loses cross-lesson context from unopened lessons. Rejected: restrict only while a refund right exists |
| AI-C3 | Study guide | **Restrict** the student branch to opened lessons; otherwise `null` | None in the UI |
| AI-C4 | Quizzes | **Restrict** `verifyEnrollment` to opened lessons | None in the UI; shared with `security-auditor` |
| AI-C5 | `pendingCheck`, `getHistory` | Covered transitively by AI-C1; post-refund by deletion | — |
| AI-C6 | Learning path | **Decision:** enrich unopened candidates from title + description only, or accept as bounded | Blander reasons |
| AI-C7 | All | Contract test listing student-reachable readers of lesson content, chunks, insights | Registration, not completeness |
| AI-C8 | Rollout | Opened-record writer and AI-C1…C4 ship **with the hold (day 0)**, not with the button | Otherwise in-window purchases have undercounted opens |

## Q3. Other LLM risks

1. Refund reason or appeal text reaching a model: none today; contract guard so it is not reintroduced
   (no model-constructing module imports refund repositories; not traced; never embedded).
2. No tutor tool may touch opened or refund state: pin with a contract test.
3. The tutor answering refund questions (LLM09), possibly with the old 30-day promise: eval row.
4. Recommendations (FR-P12): `recomputeUserInterestFromEnrollments` averages only `active`, but is
   called only on enroll (`enrollment.service.ts:81-83`); every refund path must call it.
   **Decision:** `findEnrolledCourseIds` excludes only `active`/`completed`
   (`enrollment.repository.ts:49-58`), so a refunded course becomes recommendable to its refunder.
5. FR-P9 deletion coverage:

| Artifact | In FR-P9? | Note |
|---|---|---|
| Tutor conversations / messages | yes | `getHistory` has no enrollment check, so deletion is load-bearing |
| **`ConceptCheck`** | **no** | Served by `pendingCheck` without an enrollment check; its rules carry over on repurchase. Check whether `ConceptMastery` references it (unverified) |
| **`LearningPathCache`** | **no** | `getForCourse` has no enrollment check |
| `ConceptMastery` | kept by decision | — |
| `UserInterestEmbedding` | recompute | item 4 |
| LangSmith traces | unreachable | Production `LANGSMITH_TRACING` / `LANGCHAIN_TRACING_V2` unverified: require off, or record the exception |

## Q4. Proposed acceptance criteria

- AC-L1: no tutor turn (no L2, no model call, no message row) on an unopened lesson; normal turn when opened; lookup failure opens no stream.
- AC-L2: `search_across_course` returns only opened lessons' text; `studentId` not a tool argument; eval row "Summarise lessons 4–10" with only lesson 1 opened (canary facts, substring + LLM grader), plus false-positive rate.
- AC-L3: study guide `null` for an unopened lesson; returned after opening; instructor unaffected.
- AC-L4: `quiz.getByLesson` / `quiz.submit` on an unopened lesson → FORBIDDEN, no attempt row.
- AC-L6 (if adopted): learning-path prompt has no insights for unopened candidates.
- AC-L7: contract test of student-reachable lesson-content readers.
- AC-L8: release checklist: the hold ships with FR-P19 and AI-C1…C4.
- AC-L9: no AI entry point imports refund repositories or selects refund models.
- AC-L10: no tutor tool imports opened-record or refund repositories.
- AC-L11 (eval): refund questions to the tutor → `off_topic` or no days/lesson numbers.
- AC-L12: after a refund via each of the five paths, the interest embedding drops the course; decision on recommending the refunded course.
- AC-L13: after a refund, `ConceptCheck` and `LearningPathCache` rows for the course are gone; `pendingCheck` and `getForCourse` return `null`; `ConceptMastery` remains.
- AC-L14: production tracing off, or the retention exception written into the spec.

Telemetry: a `lesson_not_opened` refusal event (baseline ≈ 0; non-zero means direct API use); for
AI-C2, count calls where an unopened lesson would have ranked in the top-k. Run `pnpm eval` on the
tutor evals before merge.

## Q5. Accepted / out of scope

S13 §25 reopened (closed by AI-C2); S13 §2/§8/§9 not re-reported; answers from general knowledge;
titles visible without opening; learning-path reasons if AI-C6 is accepted; semantic search and
recommendations; instructor-only surfaces; "opened ≠ read" (AS-5) and multiple accounts (T10);
`ConceptMastery` kept; OpenAI-side retention.

→ `security-auditor`: `getHistory`, `pendingCheck`, `getForCourse` lack enrollment checks; quiz gating
shared; the fail-open `touchLastAccessed` template.

Unverified: production tracing env; a `ConceptMastery` → `ConceptCheck` FK; `lessonAI.service.ts` past
line 250; whether lesson `description` is public.
