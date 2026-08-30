---
feature: learning-path
status: stable
models: [LearningPathCache]
depends-on: [ai-defence-layers, progress, quiz-generation]
---

## Description

A personalised list of 3–5 next actions inside one course, generated for one student: continue with
a new lesson, review a completed one, or retry a quiz they failed. A LangGraph flow reads the
student's own progress records, proposes candidate steps **deterministically**, and then uses a model
only to choose among them and write the one-sentence reason each step carries. The result is cached
per `(student, course)` and marked stale whenever the student's progress changes.

The model never decides *what is possible* — it decides what is worth doing next, out of a candidate
set the code built.

## Business goal

A student who finishes a lesson gets no answer to "what now". The course order is one answer, but it
is the same answer for everyone and ignores what the student actually struggled with: a failed quiz,
a concept still at mastery level < 3. Without personalisation, the platform's own signals —
`ConceptMastery`, `QuizAttempt`, lesson completion — exist and steer nothing, and the student's next
step is whatever is next in the list.

The path is also the consumer that gives `ai-tutor-guardrails`' level-3 rule its teeth: anything
below 3 reads as *weak* here, so a concept a student never demonstrated keeps coming back as review.

## Supported use cases

> Node-by-node: [`../ai-flow-contracts/graph-contract.md`](../ai-flow-contracts/graph-contract.md)
> §learningPathAI documents all 8 nodes with reads / writes / failure, enforced by
> `graphContract.contract.test.ts`, plus a four-label JSDoc block on every node module.

- **Read the cached path** — `learningPath.getForCourse` (`studentProcedure`). Reads are scoped by
  `studentId` in the repository, so another student's `courseId` returns nothing rather than someone
  else's path.
- **Regenerate**, in two shapes that run the same graph:
  - `learningPath.regenerate` (`studentProcedure`) returns the finished path;
  - `POST /api/chat/learning-path` streams **progress frames only** (`"Analyzing your progress…"`,
    `"Identifying weak areas…"`, …) followed by one `done` frame carrying the persisted result.
- **Deterministic candidate generation.** `identifyWeakSignals` derives weak concepts as the union of
  *every concept of every completed lesson* and *every persisted mastery row below level 3*, keyed
  through the one shared `conceptKey` rule; `proposeReviews` offers up to 3 reviews and 2 quiz
  retries; `proposeNewLessons`
  offers up to 3 next-in-sequence lessons. `decideStrategy` routes on what the student actually has:
  `hasWeak` → reviews first, `ready` → new lessons, `empty` → the no-history path.
- **A no-history student skips the model entirely.** `setSkipLLM` marks a student with no completed
  lessons and no quiz attempts; `mergeAndExplain` then takes its deterministic branch — the first
  three candidates, lesson titles as step titles, a fixed summary — and **no model call happens at
  all**.
- **A critic loop, capped.** `reflectAndCheck` reviews the proposed path and, on rejection, sends
  feedback back to `mergeAndExplain` — at most twice.
- **The cache goes stale on its own.** Submitting a quiz (`quiz.service`) or changing lesson progress
  (`lesson.service`) calls `markStale`, so the student is told the path is out of date without anyone
  regenerating it for them.

## Unsupported use cases

- **Cross-course planning.** One path per `(student, course)`. Nothing looks at the student's other
  enrolments.
- **Letting the model invent a step.** Every `lessonId` and `quizId` the model may use comes from the
  candidate set; `semanticValidate` rejects anything outside it. The model chooses and explains — it
  does not discover.
- **Instructor visibility.** A path is the student's; no instructor-facing procedure returns it.
- **A partial path.** Three failed semantic validations produce **no path at all** rather than a
  shorter one — recorded as this surface's exclusion in `aiSurfaces.ts`.
- **An input guard (L1/L2).** Registered in `UNGUARDED_BY_DESIGN`: the whole input is a course id,
  and every other value in the prompt is read from the student's own progress records.
- **Automatic regeneration.** Staleness is a flag, not a trigger; a model call happens only when the
  student asks.

## Inputs

**Trusted — server-derived.**

- `studentId` from the session, on both entry points. Every repository read and the limiter key
  derive from it.
- `courseId` is supplied by the caller and is **replaced by the verified one**: both entry points
  look up the enrollment first and pass `enrollment.courseId` onward, never `input.courseId`.
  Downstream reads like `listOrderedWithConcepts` scope on `courseId` alone, so the value they
  receive has to be the one that proved access — and the scoped rate-limit key is derived from the
  same verified id, because a key built from raw request input lets a caller pick their own bucket.

**Untrusted — four channels, all of them database-sourced, and this is the surface where that is
easy to forget.**

| Channel | Enters at | Boundary |
|---|---|---|
| Lesson titles and concepts | `mergeAndExplain` enrichment | serialised into the human message inside `wrapUntrustedContent(…, "path_candidates")` |
| Lesson summaries and `LessonInsights.concepts` | enrichment, via `lessonInsightsRepository` | parsed at the repository read boundary (`parseStoredConcepts`) before they reach the prompt; wrapped with the candidates |
| The student's own quiz attempts, including `selectedAnswer` | enrichment for `RETRY_QUIZ` steps | wrapped with the candidates — **the student's own free text reaches a prompt through this channel** |
| `reflectionFeedback` — the critic's own words | fed back into `mergeAndExplain` | wrapped as `model_output`: model output re-entering a prompt is untrusted like anything else |

The lesson bodies themselves never enter: only titles, summaries and concept names do.

## Outputs

- **`LearningPathCache` row**, one per `(studentId, courseId)`: `steps` and `weakConcepts` as Json,
  `summary`, the model id, `generatedAt`, and `staleAt` reset to `null` on every write.
- **SSE frames** on the streaming path: `progress` frames carrying **fixed server strings** — never
  model prose — then one `done` frame with the persisted row.
- **Security events**: `fallback_triggered` when the merge node gives up.
- **What is student-visible**: each step's `title` and `reason`, and the `summary`. All three are
  model-authored on the LLM branch, and all three are what the output boundary checks.

## Validation

**1. Access, before anything else.** Session → enrollment lookup → the verified `courseId`. The tRPC
mutation checks the enrollment explicitly; its SSE twin does the same. `loadStudentSignal` then
re-checks the course itself: not deleted, `status: published`, enrollment present, else
`CourseUnavailableError` (`BAD_REQUEST`).

**2. Rate limit, two rules that are not the same rule.** The unscoped ceiling is 10/min per user; the
real contract is **1 regeneration per minute per (student, course)**, expressed as a *scoped* window
keyed on the verified `courseId`, with `countAggregate: false` so one user action does not spend two
slots of the account's AI budget. The refusal message is deliberately vague — naming the window or a
remaining count hands a caller the shape of the limiter.

**3. Structured output.** `LearningPathSchema` — 1–5 steps, `summary` 20–2000 chars, ≤ 8 weak
concepts. Every string is bounded, and the bounds are a control rather than hygiene: `lessonId` and
`quizId` are capped at 64 characters because they are **model-authored** and an unbounded id field
is a channel for carrying prose into the next attempt's prompt.

**4. Semantic validation** — the enforcing check, and the reason this surface can let a model pick
ids at all. `semanticValidate` rejects: a repeated lesson, a lesson not in this course, a
`NEW_LESSON` the student already completed, a `REVIEW_LESSON` they have not, a `RETRY_QUIZ` with no
`quizId` or with one the student never failed. On rejection the node retries, up to 3 attempts.

**5. Retry feedback is server-authored.** The correction sentence is looked up from a fixed
`Record<SemanticViolationCode, string>` and combined with an integer step position — **never the
offending id**, which the model wrote and which used to travel back into the prompt verbatim.

**6. Output boundary** (`assertModelTextClean`) over the summary, every step title and reason, and
the generated weak concepts — before the row is written. **Terminal, not report-only**: it throws,
consumes no retry, appends nothing to the feedback, and the rejected text never re-enters a prompt.
It runs identically on the streaming path, where it is still terminal rather than a retraction
because the progress frames carry no model prose — nothing has reached the student yet.

**7. The rejection is deliberately indistinguishable.** `LearningPathOutputRejectedError` extends
`LearningPathInvalidError`, so a caller cannot tell a boundary rejection from a semantic-validation
failure. A distinguishable error would give whoever authored the steering content a clean per-
generation yes/no on whether their text trips L5. The distinction lives in the security event,
server-side.

## Acceptance criteria

Applies: [`docs/constitution.md`](../../../constitution.md) — the standing constraints are inherited,
not retyped — plus:

1. A student who is not enrolled cannot regenerate or read a path for that course, on **both** entry
   points — the tRPC mutation and the SSE route.
2. Both entry points pass the enrollment's own `courseId` to the service; a request whose body names
   a different course cannot steer a downstream read.
3. A second regeneration for the same `(student, course)` inside a minute is refused, and consuming
   that allowance does not consume the account's aggregate AI budget twice.
4. The refusal message names neither the window nor a remaining count.
5. Every returned step references a lesson in this course; a `NEW_LESSON` is never a completed
   lesson, a `REVIEW_LESSON` is never an uncompleted one, and a `RETRY_QUIZ` always carries a
   `quizId` the student actually failed.
6. No two steps reference the same lesson.
7. A model that keeps producing invalid steps yields **no path** after 3 attempts, plus one
   `fallback_triggered` event carrying the violation code — never a partial or unvalidated path.
8. A retry prompt contains the violation's fixed sentence and a step number, and **never** an id the
   model authored.
9. A student with no completed lessons and no quiz attempts gets a path with **zero model calls**.
10. Model-authored text that trips the output boundary is never persisted and never rendered; the
    caller sees the same error class as a semantic failure.
11. A lesson summary, concept list or the student's own `selectedAnswer` reaching the prompt is
    wrapped; the critic's feedback re-entering the prompt is wrapped too.
12. Submitting a quiz or changing lesson progress marks the cached path stale, and a failure to do
    so never fails the student's actual action.
13. `getForCourse` returns nothing for a `(student, course)` pair the caller does not own.

## Edge cases

- **No history at all.** `setSkipLLM` → the deterministic branch of `mergeAndExplain`: first three
  candidates, lesson titles as step titles, a fixed summary. The cheapest path through the graph is
  the one taken by the student most likely to be browsing.
- **The critic keeps rejecting.** `reflectAndCheck` is capped at 2 loops; on the third pass it
  returns no feedback and the graph ends with whatever `mergeAndExplain` last produced.
- **A course unpublished or soft-deleted after enrolment.** `loadStudentSignal` throws
  `CourseUnavailableError` — the graph stops at its first node and nothing else runs.
- **A lesson with no `LessonInsights` row.** Enrichment falls back to the lesson's `description`, and
  to empty concepts — a missing study guide degrades the reason text, it does not fail the path.
- **A stale path that is never regenerated.** `staleAt` is a flag; the student keeps reading the old
  path until they ask for a new one.
- **`markStale` failing.** Logged and swallowed at both call sites — an error here would tell a
  student their quiz answer or lesson progress was not recorded, for work that was already
  committed.
- **Client aborts the SSE stream.** The route breaks its loop and closes; because persistence happens
  inside `streamRegenerate` before the `done` frame, an abort after the write keeps the row and an
  abort before it leaves the previous path in place.

## Failure & fallback

The node table with a per-node failure column is
[`../ai-flow-contracts/graph-contract.md`](../ai-flow-contracts/graph-contract.md) §learningPathAI.
The decisions behind it:

- **This graph has no `withNodeErrors`.** Unlike `courseAI`, its nodes throw domain errors
  (`CourseUnavailableError`, `LearningPathInvalidError`, `LearningPathRateLimitedError`) that reach
  tRPC through `handleServiceError`, so retryable/fatal typing does not apply here. That is a
  deliberate non-generalisation, not an omission — see Agent notes.
- **Five of the eight nodes cannot fail.** `identifyWeakSignals`, `decideStrategy`, `setSkipLLM`,
  `proposeReviews` and `proposeNewLessons` are pure functions over loaded state. The failure surface
  is exactly: the initial load, the two model nodes, and the write.
- **`reflectAndCheck` propagates a model error unguarded** — a critic outage fails the whole
  regeneration rather than shipping an unreviewed path.
- **Giving up is declared.** Three failed semantic validations emit `fallback_triggered` with the
  violation code before throwing. Without the event, a model being steered into repeated invalid
  paths looks identical to a provider hiccup.
- **The rate limiter fails closed**; the boundary fails closed. There is no fail-open direction on
  this surface, because there is no user waiting on a partially useful answer — a missing path is a
  disabled button, not a broken lesson.
- **Nothing is persisted on any failure path.** The write is the last statement, after the boundary.

## Security

No input guard by design (`UNGUARDED_BY_DESIGN`, reason recorded there). The per-rule claim register
— input guard `n/a`, wrapping applied, `system_prompt_echo` and `untrusted_data_echo` applied,
`off_origin_link` `n/a` because the path renders as plain text, render policy plain text, resource
limits applied — lives in `server/services/_shared/conformance/aiSurfaces.ts` and is re-derived from
source by its own contract test. Layer controls are inherited from
[`../ai-defence-layers/`](../ai-defence-layers/spec.md).

**Three properties worth stating where a reader will find them:**

1. **The verified `courseId` is the security boundary of this feature.** Both entry points had to
   learn it separately — the tRPC mutation shipped *without* the enrollment check the SSE route
   already had, which let any authenticated student obtain lesson titles and model-written reasons
   for a course they were not enrolled in. Fixed; the criterion pinning it is AC 1–2, and the shape
   of the bug is why the verified id, not the request's, travels onward.
2. **The scoped limiter key is derived, never accepted.** `{ scope: courseId }` uses the verified id;
   a key from raw input lets a caller mint buckets.
3. **The error class is a control.** Collapsing the boundary rejection into the semantic-failure
   class removes a hill-climbing oracle. Do not "improve" the error taxonomy here without reading
   `learningPathAI.errors.ts` first.

**The exclusion, recorded in `aiSurfaces.ts`:** after three failed semantic validations the node
gives up and throws; the event says so, but **no path is produced**. Accepted — a wrong path is worse
than no path on a surface whose whole job is to tell a student what to do next.

## Performance

**Enforced today:**

- Rate limits (ADR-027, Redis-backed, fail-closed): **10/min per user** unscoped, and the real rule
  **1/min per (student, course)** as a scoped window; the cross-feature aggregate is 30/min, and the
  scoped check deliberately does not spend a second aggregate slot.
- Model: `gpt-4o-mini` — `mergeAndExplain` at temperature 0.3, `reflectAndCheck` at 0.
  `MODEL_TIMEOUT_MS` **30 s** per call, `MODEL_MAX_RETRIES` **2**.
- Per run: `GRAPH_RECURSION_LIMIT` **25** and `TURN_DEADLINE_MS` **120 s** via `withTurnDeadline()`,
  applied on both the invoke and the streaming path. This is the graph that most needs the turn
  deadline — a critic loop plus a retry loop is the shape whose worst case is the sum of many
  per-call budgets.
- **Worst case model calls in one run**: 3 merge attempts × up to 3 reflection passes, so the loops
  are what the deadline and the recursion limit actually bound.
- The `skipLLM` branch costs **zero** model calls; the cache costs zero until the student asks.

**Not measured**, the same gap the other AI surfaces carry: no p95 latency budget, no per-run token
or cost ceiling. Owner is workstream D of
`ai-hardening-plan.md` *(removed 2026-08-26; in git history)* §3. The unbounded quantity here is
**enrichment**: `gatherEnrichment` fetches a summary, concept list and up to 5 quiz attempts per
unique candidate lesson, and the whole thing is serialised into one human message — so prompt size
scales with the candidate count, not with anything the student typed.

## Observability

- **`fallback_triggered`** from `mergeAndExplain`, `layer: "model_call_fallback"`, `ruleIds` carrying
  the **violation code** (not the offending id), `subject: { kind: "course", id }`. Baseline zero,
  forwarded to Sentry (ADR-029). The subject is the course, not the student: the student is the
  operator here, never the author of the content that steered the model.
- **Output-boundary events** via `validateModelText`, `feature: "learningPathAI"` — and here they are
  the *only* record of a rejection, because the error the caller sees is deliberately
  indistinguishable from a semantic failure.
- **Progress frames are a product signal, not telemetry** — seven fixed server strings keyed on node
  name. They carry no model prose, which is what keeps the boundary terminal on the streaming path.
- **No event carries a step title, a reason, a summary or a lesson id.**
- **The trace label differs from the security label**: `traced()` tags the span
  `feature: "learning-path"` while security events use `learningPathAI`. Anyone joining LangSmith
  traces to security events must know.

## Test & eval scenarios

Tests run in PR CI; **evals never do** — they are the manual gate before a prompt or a node schema
changes.

| Group | Level | File |
|---|---|---|
| Enrollment enforced on the tRPC mutation, and the verified id used | integration | `server/api/routers/learningPath.accessControl.integration.test.ts` |
| The same on the SSE route | integration | `app/api/chat/learning-path/route.accessControl.integration.test.ts` |
| End-to-end graph run over seeded progress | integration | `learningPathAI.integration.test.ts` |
| Output boundary terminal on both paths, nothing persisted | integration | `outputBoundary.integration.test.ts` |
| Give-up after 3 semantic failures, with the event | unit | `nodes/mergeAndExplain.fallback.test.ts` |
| Retry feedback carries a fixed sentence and a number, never a model-authored id | unit | `nodes/mergeAndExplain.violationFeedback.test.ts` |
| Candidates, summaries and critic feedback are wrapped before the prompt | unit | `nodes/mergeAndExplain.wrap.test.ts` |
| Every node documented with reads/writes/failure + four-label JSDoc | contract | `graphContract.contract.test.ts` |
| Surface declared with its real controls | contract | `aiSurfaces.contract.test.ts` |
| No unwrapped untrusted content reaches a prompt | contract | `wrappingCoverage.contract.test.ts` |

**Evals**: `pnpm eval learningPathAI:learningPath` (`evals/datasets/learningPathAI/learningPath.jsonl`)
— path quality against seeded progress fixtures. **The gap, named**: there is no eval for the critic
(`reflectAndCheck`) at all, so a change to `REFLECT_SYSTEM_PROMPT` has nothing measuring whether the
critic still rejects the paths it should. The adversarial side is the shared `aiOutput` sets.

## Source of truth

`documentation-process.md` §1a is the standing rule; for this feature:

- **Behaviour now** — this file.
- **Node-by-node contract** —
  [`../ai-flow-contracts/graph-contract.md`](../ai-flow-contracts/graph-contract.md) §learningPathAI,
  8 nodes, enforced by `graphContract.contract.test.ts`, plus the four-label JSDoc on each node
  module enforced by the same test.
- **Controls** — `server/services/_shared/conformance/aiSurfaces.ts`, including the give-up
  exclusion; layer design in [`../ai-defence-layers/`](../ai-defence-layers/spec.md).
- **Decisions** — ADR-026 (shared defence layers), ADR-027 (distributed and scoped rate limiting),
  ADR-029 (error-reporting funnel). **This feature owns no ADR**: it shipped before the current
  model, and the graph's own design choices — no checkpointer, no `withNodeErrors`, a critic instead
  of a confidence score — are recorded here and in the node contract rather than in a decision
  record. Adding one is only worth it if a future change reopens one of those three.
- **Correctness** — the tests and eval above.
- This feature predates the plan-gated workflow and has no `build/plan.md`.

## Agent notes

- **`decideStrategy.node.ts` exports two symbols** — the `decideStrategy` predicate and
  `setSkipLLMIfEmpty`, registered as the node `setSkipLLM`. The contract test keys JSDoc lookup on
  (file, exported symbol); keying on file alone would let one of the two go undocumented while CI
  stays green.
- **Do not generalise `withNodeErrors` to this graph as a drive-by.** `courseAI` needs retryable/fatal
  typing because its failures reach an SSE client that must decide whether to offer a retry button.
  Here the errors are domain errors that `handleServiceError` already maps, and the streaming path
  emits no per-node error frames. Widening the wrapper changes what `handleServiceError` sees.
- **The loop edge out of `reflectAndCheck` is an inline predicate**, not a named one, so it has no row
  of its own in the contract's predicate table. It returns to `mergeAndExplain` while
  `reflectionFeedback` is set and `reflectionAttempt < 2`.
- **`mergeAndExplain` is called more than once per run by design**, and it rebuilds its prompt each
  time. Anything expensive added to `gatherEnrichment` is paid on every attempt — it is currently
  computed once, before the retry loop, and it should stay that way.
- **Weak is derived, not read, and it says WHAT the student did rather than a number.** Since
  2026-08-30 a `WeakConceptRow` carries `evidence: "encountered" | "applied"` instead of a `level`.
  `encountered` is computed at read time — the concept appears in a completed lesson and no mastery
  row exists — and is deliberately **not stored**: "has seen a lesson mentioning X" was never
  evidence about X, and storing it made "has mastery" and "has been exposed" the same query.
  `applied` means a row at the conversation ceiling: the student answered a concept check about it.
  A level-3 row is dropped from the union entirely, so a student is never sent to review what they
  have demonstrably mastered.

  The label reaches a human twice — the reason seed goes into `mergeAndExplain`'s prompt *and*
  surfaces in the path's reason text — so it has to be true for both readers. A bare "2/3" was
  neither: meaningless outside this codebase, and a misdescription of what the row recorded.

  **Weak still means `level < 3`, and that threshold is shared.** `ai-tutor-guardrails` caps
  conversation-earned mastery at 2 precisely so that concepts a student only *talked* about keep
  reading as weak here. Changing either number without the other silently changes what the platform
  recommends.

- **`pnpm eval learningPathAI:learningPath` does not cover the derivation.** It feeds `weakConcepts`
  in from its dataset and invokes `reflectAndCheck` alone — `identifyWeakSignals` and
  `proposeReviews` are never called, and the eval reports no baseline (it does not call `reportRun`).
  So a green 8/8 says the terminal validator accepts a well-formed path; it says nothing about how
  the weak set was derived. Those two nodes are covered by their unit tests and by
  `learningPathAI.integration.test.ts`, and that is deliberate — but do not read the eval as
  evidence for them, which is exactly the mistake available here.

- **The derived union is ordered and capped, and both matter.** `applied` rows come first, then
  `encountered`, then the list is cut at `MAX_WEAK_CONCEPTS`. Ordering, because the sparse rows
  recording something the student actually *did* would otherwise sit behind every bare `encountered`
  entry and be truncated away. Capping, because the list is `JSON.stringify`'d into the merge prompt
  and again into every reflection retry: bounded by persisted rows it was small, derived from
  completed lessons it grows with the course. And `proposeReviews` deduplicates by lesson **while
  walking** the list rather than after slicing it — slicing first collapsed every review onto the
  first completed lesson.
- **Concept names arriving here are LLM-authored** (`lessonInsightsAI` extracted them from lesson
  text) and are bounded at the repository read boundary. This surface consumes them; it is not where
  they are validated.
- **The student's own `selectedAnswer` reaches a prompt.** It is the one channel here that carries
  free text a person typed. It is wrapped with the candidates — do not move quiz-attempt enrichment
  out of that wrapper when refactoring the message builder.
- **Persisting inside `streamRegenerate` before the `done` frame is deliberate.** It means a client
  that disconnects mid-stream still gets the path it paid for on the next read, and it is why the
  abort path needs no special handling.
- **`markStale` is fire-and-forget at both call sites**, and must stay that way: it runs after a quiz
  submission and after a progress change, both of which are already committed when it runs.