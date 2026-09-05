---
feature: ai-course-builder
status: in-progress
models: [CourseGeneration, CourseGenerationMessage]
depends-on: [course]
---

## Description

A guided AI chat that walks an instructor through building a course draft. A LangGraph state
machine drives one turn at a time over four fixed steps — `basic → objectives → requirements →
curriculum` — streaming the reply over SSE while a preview panel fills in beside it. The result is a
`CourseGeneration` draft an instructor reviews and turns into a course; the chat itself publishes
nothing.

## Business goal

Instructors find blank-page course creation slow; a guided AI chat that asks the right questions in
order and drafts each step for review gets a publishable course outline faster than a bare form.

## Supported use cases

- Streaming chat (SSE, `app/api/chat/course/route.ts`) walks an instructor through a fixed step order:
  `basic → objectives → requirements → curriculum` (`DraftStep` enum).
- A LangGraph `StateGraph` (`server/services/courseAI/graph/`) drives the turn: classify the user's
  intent (`continue` / `revise` / `clarify`), call tools if needed, draft a reply, decide whether the
  step is complete, extract structured step data, validate it, score confidence, persist, and emit SSE
  events for the live preview panel.
- Revising an already-committed step (`revise` intent) updates that step's content in place, persists
  immediately, and emits `content_revised` so the preview refetches — it never re-triggers extraction.
- Four tools augment the model: `search_similar_courses`, `fetch_instructor_prior_courses`,
  `validate_curriculum_coherence`, `lookup_category_taxonomy`.
- A step only auto-advances at `confidence_score ≥ 0.8`; below that the UI shows an explicit Accept
  button — the instructor approves every low-confidence extraction.
- No LangGraph checkpointer: each request rehydrates state from `CourseGeneration` +
  `CourseGenerationMessage` rows (ADR-003), so the flow survives serverless cold starts.

## Unsupported use cases

- **Publishing.** The flow produces a `CourseGeneration` draft. A `Course` exists only after a human
  acts on that draft — which is what prices the finalize-path exclusion in Security below.
- **Lesson bodies.** The `curriculum` step drafts structure — sections and lesson titles. Lesson
  text, quizzes and study guides are other surfaces (`quiz-generation`, `study-guide`), and this one
  never writes them.
- **Editing outside the four steps.** `revise` re-opens a *completed* step; there is no free-form
  "change anything" path, and a revision never re-triggers extraction.
- **Resuming from a graph checkpointer.** There is none (ADR-003). Every request rehydrates state
  from `CourseGeneration` + `CourseGenerationMessage`, which is what makes the flow survive
  serverless cold starts.
- **Sharing a draft between instructors.** A generation belongs to the user who created it;
  `getOrCreateCourseGeneration` is scoped by `userId`.

## Inputs

Node and predicate names below refer to
[`../ai-flow-contracts/graph-contract.md`](../ai-flow-contracts/graph-contract.md), which holds the
per-node state contract.

**Trusted — server-derived, never read from the request body.**

- `session.user.id` and the `INSTRUCTOR` role check, both before anything else runs
  (`route.ts`, 401 then 403). The rate-limit key derives from the id.
- `instructorId` reaches the graph through `RunnableConfig.configurable`, never as a model-supplied
  tool argument — the one invariant that keeps `fetch_instructor_prior_courses` from becoming a
  cross-tenant read.
- `courseGenerationId` arrives in the body but is resolved through `getOrCreateCourseGeneration`,
  which scopes it to the caller.

**Untrusted — four channels.**

| Channel | Enters at | Boundary |
|---|---|---|
| Instructor message | body, `CourseChatBodySchema` | Zod shape → `validateMessageLength` → `guardUserInput` L1 patterns + L2 topic relevance, before the generation row is touched |
| Replayed history | `CourseGenerationMessage` rows rehydrated per request | rows written with `contextEligible: false` — the turn that elicited a retracted reply — never return to the model |
| Tool results | `tool_node` | **`search_similar_courses` returns other instructors' course copy.** `chat_response` deliberately does not read `state.messages`, so that text never reaches a streamed reply |
| Category taxonomy | `lookup_category_taxonomy` | platform-authored, but arrives through the same tool channel |

## Outputs

- **SSE frames** — `start`, `token`, `node_start`, `tool_call`, `confidence`, `content_revised`,
  `step_committed`, and exactly one terminal frame: `done`, `error` (with `retryable`), or `retract`.
  A guard refusal is one-shot (`guard_blocked` + `done`) and never reaches the graph.
- **`CourseGeneration.content`** — written by `persist_and_emit` when confidence clears the
  threshold, and by `revise_prior_field` *before* the reply is judged (see Security).
- **`CourseGenerationMessage` rows** — the assistant turn, written only when the turn is not aborted,
  not failed and not rejected; the user turn, written **after** the graph so it never appears in its
  own history, and carrying `contextEligible: !isRejected`.

## Validation

**1. Input, before the graph** (`route.ts`): session → `INSTRUCTOR` role → `checkAiRateLimit` →
`CourseChatBodySchema` (Zod) → `validateMessageLength` → `guardUserInput`. A guard refusal returns
before `getOrCreateCourseGeneration`, so the `finally` that persists the user message is never
reached and **nothing at all is written**.

**2. Tool-call arguments.** The four tools take Zod-validated arguments and each catches internally,
returning `{ error }` as tool *output* rather than throwing — so `tool_node` failures are data, not
exceptions. The one realistic exception on that path is LangGraph rejecting the model's tool
arguments, which reaches the route unclassified and therefore reads as non-retryable. `instructorId`
is never among those arguments.

**3. Extracted step data** (`validate` node). Full Zod validation of `draftStepData`. It does not
throw: invalid data writes `validationErrors` and `routeAfterValidate` sends the turn to `clarify`,
so the instructor gets a clarifying question naming what is missing — not an error, and nothing is
persisted.

**4. Confidence** (`confidence_score`). A step auto-advances only at `≥ 0.8`; below that
`routeAfterConfidence` returns `hold`, the graph ends without `persist_and_emit`, and the UI shows an
explicit Accept button. Low confidence is not a failure — it is the handover to a human.

**The threshold is only as good as what the node scores against it, and today it is not good enough.**
Measured 2026-09-03 on the repaired `courseAI:confidenceScore` set: of the 15 steps the node scored
`≥ 0.8`, **11 were genuinely complete — 73.3% against the eval's own 0.85 gate**, twice in a row. The
four false positives are a one-objective step (`"Learn Python"`), a one-requirement step
(`"some experience"`), a curriculum of one `Section 1` holding one `Lesson 1`, and two two-word
objectives (`"use AWS"`, `"understand cloud"`). Each auto-advanced: the handover this section
describes did not happen on the steps that most needed it.

The cause is a contradiction inside the prompt rather than the model. Its guidelines say *"If
EXTRACTED DATA has all required fields and the content is specific… score at least 0.85"* and *"A
brief conversation is not a reason to score low"*, while a lower band exists for *"generic titles, few
lessons"*. A one-word objective satisfies the floor rule (the field is present and non-empty) and the
band rule (it is generic) at once, and the floor wins. **Presence of a field is being scored as
specificity.** That is what this reopening fixes, in the prompt — the 0.8 threshold and the handover
semantics above do not move.

**5. Model output.** Two checks with different jobs. The `output_boundary` node runs the shared
boundary silently inside the graph; the route's `finally` runs `validateModelText` **unconditionally
and is the sole emitter**. The split is deliberate: a node cannot fire on client abort or a
mid-stream provider error, which are exactly the two exits where tokens already reached the browser.
"At most once per turn" is structural — `finally` runs once per request.

## Acceptance criteria

Applies: [`docs/constitution.md`](../../../constitution.md) — the standing constraints are inherited,
not retyped — plus:

- An instructor can complete all four steps via chat alone and land on a valid, publishable course
  draft without touching a form.
- Saying "yes" / "looks good" / similar only commits the **current** step — it never silently commits
  a revision the instructor was just acknowledging.
- A clarifying question from the model never produces a step-data extraction; only `continue`-intent
  turns that pass `assess_completion` do.
- Refreshing the page mid-conversation resumes from the same step with full message history, no state
  lost.

**Confidence calibration** (reopened 2026-09-05; each line is an eval row on
`courseAI:confidenceScore`):

- **The node meets its own gate.** Of the steps it scores `≥ 0.8`, **at least 85%** are
  `expected.complete` — reported *and* met, not reported only.
- **A placeholder never auto-advances.** `objectives: ["Learn Python"]`, `requirements:
  ["some experience"]`, a curriculum of one `"Section 1"` containing one `"Lesson 1"`, and
  `objectives: ["use AWS", "understand cloud"]` each score **< 0.8** (rows 04, 06, 08, 18).
- **Caution is not bought by refusing to advance.** The same run keeps **at least 10 of the 11**
  `expected.complete` rows at `≥ 0.8`. Precision alone is maximised by a node that scores everything
  low, so the run gates on both numbers or on neither. The floor is 10 rather than 11 to leave one row
  of provider drift — a gate that reddens on noise stops being read.
- **The two numbers together leave exactly one degree of freedom, which is what makes the target
  precise.** With the 11 true rows held, `11 / (11 + k) ≥ 0.85` allows **k ≤ 1**: the fix has to remove
  at least three of the four false positives, and may keep at most one. That is the whole target, and
  it is arithmetic rather than an aspiration.
- **Field presence is not specificity.** A step whose required fields are all present but whose values
  are single words or default titles scores below the floor the prompt used to guarantee it.
- **The prompt is the only lever this reopening moves.** `CONFIDENCE_THRESHOLD` stays **0.8** and the
  handover semantics stay as §Validation describes them. Two levers changed at once cannot be told
  apart afterwards, and the threshold is documented in three places (this spec, `graph-contract.md`,
  the `ConfidenceBadge` UI) that would all have to move with it.
- **The prompt may not name the golden set.** No literal drawn from
  `evals/datasets/courseAI/confidenceScore.jsonl` — `"Learn Python"`, `"Section 1"`, `"use AWS"` and
  the rest — appears in the node's prompt text, enforced by a contract test rather than by review. Four
  of the twenty rows are the ones being fixed, so teaching the prompt those four strings would pass the
  gate while fixing nothing. Precedent for the mechanism: `evals/_shared/promptFidelity.ts` and its
  contract test, and `docs/constitution.md` §Correctness — a repeated check becomes a contract test.

## Edge cases

- **Low confidence (`< 0.8`).** The stream ends with `done`, both chat messages persist, no step data
  does, and the instructor gets an Accept button. Not an error path.
- **Validation failure.** Routes to `clarify`, not to END and not to an error — the instructor sees a
  question naming what is missing.
- **An instructor who asks for a stub on purpose still gets the Accept button.** Golden row 08 is
  exactly this case — *"Start me off with a section and a lesson in it, I'll write the rest myself"* —
  and it stays labelled `complete: false`. The score judges the **data**, and the instructor's consent
  is expressed by pressing Accept, which is what the handover is for. Relabelling it would teach the
  prompt to raise its score from an *intention stated in the conversation* — the same history channel
  that leaked the answer into this set before 2026-09-03, reopened deliberately. A step that is sparse
  is sparse whoever asked for it.
- **A tool that never returns.** There is **no timeout anywhere on this path**. The SSE stream stays
  open until the client aborts, and the instructor sees an indefinite in-progress indicator. This is
  documented behavior, not an accident: adding retry/timeout belongs to workstream D.
- **Client abort.** Rethrown untouched and unlogged by `withNodeErrors`, so aborts never enter the
  failure signal. Both shapes count — a real `AbortError` and `@langchain/core`'s `ModelAbortError`,
  which every `.invoke()` node produces under `streamEvents`.
- **Mid-stream provider error.** The `failed` flag exists because gating persistence on
  `!aborted && !isRejected` alone would save the **truncated** reply, send `done` after `error`, and
  replay that text into the next turn's context.
- **A revision inside a turn whose reply is then rejected.** `revise_prior_field` already wrote to
  `CourseGeneration.content`, and the client already saw `content_revised`. The write stands and
  `content_revised_retained` correlates it — see Security.
- **`classify_intent` or `assess_completion` failing.** Both swallow their own model errors and fall
  back to a default verdict (`continue`, `assessReady: false`), so no error escapes them to classify.
  That silent fallback is their documented failure mode.

## Failure & fallback

The five-scenario matrix is
[`../ai-flow-contracts/graph-contract.md`](../ai-flow-contracts/graph-contract.md) §"Failure matrix".
The decisions behind it:

- **Failures are typed, and the type reaches the instructor.** `withNodeErrors` classifies a node
  failure as `RetryableNodeError` (provider timeout, rate limit, network) or `FatalNodeError`
  (invalid structured output, programming error); the route maps that onto `{ type: "error",
  retryable }` with try-again copy or the generic copy. Classification reads the error's *shape*, not
  message substrings — provider copy changes without notice.
- **An unclassified error reads as non-retryable.** An unknown shape is more likely a bug than a
  transient fault, so the instructor is not trained to retry one forever.
- **No node failure closes the stream without an `error` frame first.**
- **The rate limiter fails closed** (`429`, ADR-027); the input guard's L2 relevance check **fails
  open** with `fallback_triggered`, as it does on every surface that uses it.
- **Nothing partially generated is persisted.** Abort, mid-stream error and output rejection each
  suppress the assistant row. The user row is still written, with `contextEligible` set from the
  verdict, so the thread keeps the turn while the model's context loses it.
- **Neither error frame carries the provider's message, node internals, or a stack trace.** One
  `logger.error` per failed turn is the sole error-level report; `withNodeErrors` logs its own copy
  at `debug` to avoid a double capture.

## Security

Controls are inherited by reference from [`../ai-defence-layers/`](../ai-defence-layers/spec.md),
[`../ai-input-trust-boundary/`](../ai-input-trust-boundary/spec.md) and
[`../ai-chat-route-authorization/`](../ai-chat-route-authorization/spec.md). The per-rule claim
register for this surface — input guard applied, wrapping applied, all three output rules applied,
render policy applied, resource limits applied — is
`server/services/_shared/conformance/aiSurfaces.ts`, re-derived from source by its own contract test.

**This reopening adds no control and touches none.** Rewriting the `confidence_score` guidelines is a
change *inside* an already-registered entry point — `documentation-process.md` §3a calls that neither
new authority nor a modified control, so no design pass runs and the controls above are inherited by
reference unchanged. The wrapping the node already applies (`wrapUntrustedContent` over
`draftStepData`, history and `assistantText`) stays exactly as it is: the prompt gains scoring
instructions, not new inputs. Worth stating once, because the direction of the change is toward
*withholding* auto-advance, and that direction cannot weaken a boundary — a step that does not
advance persists nothing.

**Three exclusions are recorded there, and they are the parts a reader must not discover from the
code:**

1. **The finalize path commits model-authored `draftStepData` — course title, subtitle, section
   titles — with no output boundary in front of it.** Residual is low (no free prose, and a human
   reviews before a `Course` exists) but not zero: title and subtitle feed `CourseEmbedding` →
   `search_similar_courses` → *another instructor's builder*.
2. **`revise_prior_field` persists to `CourseGeneration.content` before `chat_response` runs**, and
   therefore before the output boundary. The write is **priced** by `content_revised_retained` (D-L)
   rather than prevented, and it feeds the same embedding tail as (1).
3. **`chat_response` deliberately does not read `state.messages`**, so tool results carrying other
   instructors' course copy never reach a streamed reply. This is a control expressed as an absence —
   a future change that "helpfully" feeds tool output into the reply removes it silently.

## Performance

**Enforced today:**

- Rate limit (ADR-027, Redis-backed, fail-closed): `courseAI` **20 requests/min per user**, inside
  the cross-feature aggregate of **30/min**.
- Input ceiling: `validateMessageLength`, **2,000 characters**.
- Per model call: `MODEL_TIMEOUT_MS` **30 s**, `MODEL_MAX_RETRIES` **2** — so 90 s per call worst
  case.
- Per turn: `TURN_DEADLINE_MS` **120 s**, combined with the caller's abort signal at the streaming
  call site. Without it a chained graph's worst case is the sum of every node's per-call budget.
- `GRAPH_RECURSION_LIMIT` **25**.
- Model: `gpt-4o-mini` on every node.

**Not bounded, and it is the one gap on this surface with a user-visible failure mode:** no tool call
has a timeout. A tool that hangs holds the stream open until the client aborts, and the turn deadline
does not cover it. **Measured since 2026-09-03** — [`ai-observability`](../ai-observability/spec.md), ADR-035. One
metric line per node (`latencyMs`, `promptTokens`, `completionTokens`, `costUsd`) and one per turn
(`calls`, `wallMs`, `ttftMs`, the turn total). This is the surface the metric was shaped around: a
turn here is 6–8 nodes, and only a per-node split answers *which* node is expensive — a turn total
alone would have hidden it.

**No structural token ceiling, and the reason is the graph, not the input.** The student's message is
capped at 2,000 characters, but each node feeds its output forward into the next node's prompt, so
per-turn prompt size is bounded only by `GRAPH_RECURSION_LIMIT` **25** and the 120 s turn deadline —
both bounds on *count and wall time*, not on tokens. This is the one AI surface here where the ceiling
has to come from the measurement rather than from arithmetic over the inputs.

**Still not set:** the p95 target and the per-turn cost ceiling. Owner is the baseline in
[`ai-observability`](../ai-observability/spec.md) §Performance, which sequences them after the metric
ships deliberately.

## Observability

- **Node-level progress is a product signal, not telemetry.** `node_start` frames for the six
  informative nodes, `tool_call` frames with the tool's arguments, and `confidence` — the preview
  panel is built on them.
- **Security events** through the shared taxonomy with `feature: "courseAI"` and
  `subject: { kind: "generation", id }`: `guard_blocked` / `guard_off_topic` / `guard_suspect` from
  the input guard, `fallback_triggered` when L2 is unavailable, `output_validation_failed` from the
  route's `finally`, and `content_revised_retained` when a retracted turn had already written a
  field.
- **One error-level log line per failed turn**, carrying the node name and the error kind as
  structured fields — the precondition for the failure-rate metric in workstream D. `withNodeErrors`
  logs at `debug` so the same failure is not captured twice.
- **No event carries message text, reply text, or course copy.**

## Test & eval scenarios

Tests run in PR CI; **evals never do** — they are the manual gate before a prompt or a node's schema
changes. This surface has the repo's densest eval coverage, because four of its nodes are
classifiers.

| Group | Level | File |
|---|---|---|
| Node error typing: retryable vs fatal vs abort | unit | `graph/withNodeErrors.test.ts`, `graph/nodeErrors.test.ts` |
| Output boundary inside the graph | unit | `graph/nodes/outputBoundary.test.ts`, `graph/outputBoundary.contract.test.ts` |
| `chat_response` does not read `state.messages` (exclusion 3) | contract | `graph/nodes/chatResponse.containment.contract.test.ts` |
| Auto-transition behaviour of `chat_response` | unit | `graph/nodes/chatResponse.autoTransition.test.ts` |
| System prompt composition | unit | `prompts/systemPrompt.test.ts` |
| `contextEligible` filtering across turns | integration | `contextEligible.integration.test.ts` |
| Route: guard exits, persistence gating, SSE frames | integration | `app/api/chat/course/route.integration.test.ts` |
| Route: typed errors reaching the client | integration | `route.nodeErrors.integration.test.ts` |
| Route: the `finally` boundary on abort and mid-stream error | integration | `route.outputBoundary.integration.test.ts` |
| Every node and route predicate documented | contract | `graph/graphContract.contract.test.ts` |

**Evals** (`pnpm eval <name>`): `courseAI:classifyIntent`, `courseAI:assessCompletion`,
`courseAI:extractStepData`, `courseAI:confidenceScore` — one per classifier node, each with its own
dataset under `evals/datasets/courseAI/`. The adversarial side is the shared `aiGuard` sets, since
`guardUserInput` is shared with the tutor.

**`courseAI:confidenceScore` gates on two numbers, not one** (reopened 2026-09-05). Precision among
`≥ 0.8` predictions is the existing gate at 0.85; on its own it is maximised by a node that scores
everything low, and `accuracyGate` only catches the degenerate end of that (an empty prediction set
scores 0 and fails). A partial collapse — three rich rows above the line, eight genuine ones below —
would read as **100% precision** while quietly sending eight completable steps to a manual Accept.
The run therefore also holds a floor on how many `expected.complete` rows stay above 0.8. The set is
20 rows, 11 of them complete, so **one row is 6.7 points of precision**: this measures a direction,
not a decimal, and a change inside a couple of points is noise. **The small-n limit is accepted, not
solved here** — growing the set is separate work with its own leak risk, and doing it in the same
change would make it impossible to say whether the prompt or the data moved the number.

**One measurement comes before the fix, and may cancel it.** The per-row score distribution is not
known: if the false positives sit at ~0.85 while the true rows sit at ~0.92, the ranking is sound and
only the cut point is wrong; if a false positive outscores a true row, the ranking itself is broken
and **no threshold and no prompt wording separates them**. These are different defects with different
fixes, so the first task of the plan prints the score for all 20 rows before anything is edited. It
costs one run — about $0.002 — and it decides whether prompt work can succeed at all.

## Source of truth

`documentation-process.md` §1a is the standing rule; for this feature:

- **Behaviour now** — this file.
- **Node-by-node contract, flow diagram, failure matrix** —
  [`../ai-flow-contracts/graph-contract.md`](../ai-flow-contracts/graph-contract.md), enforced by
  `graphContract.contract.test.ts`; plus the four-label JSDoc block on every node module, enforced by
  the same test.
- **Decisions** — [ADR-016](../../../adr/016-langgraph-course-builder.md) (graph design and the
  alternatives), ADR-003 (repository pattern, and why there is no checkpointer), ADR-022 (input trust
  boundary), ADR-023 (route authorization), ADR-026, ADR-027, ADR-029.
- **Controls** — `server/services/_shared/conformance/aiSurfaces.ts`, including the three exclusions
  above.
- **Correctness** — the tests and evals above.
- This feature predates the plan-gated workflow and has no `build/plan.md`; the spec and the graph
  contract are the record.

## Agent notes

- The node-by-node state contract, the flow diagram and the failure matrix live in
  [`../ai-flow-contracts/graph-contract.md`](../ai-flow-contracts/graph-contract.md); a contract test
  fails CI if a node is added without a row there.
- Run modes: `chat` (entry at `classify_intent`) and `finalize` (entry at `extract_step_data`,
  used to force-extract on demand).
- Instructor ID is sourced from `RunnableConfig.configurable`, never from LLM input — don't let a tool
  accept it as a model-supplied argument.
- All graph nodes must forward `RunnableConfig` to model calls, or `on_chat_model_stream` events stop
  propagating to the SSE stream.
- `CourseAIService` (`server/services/courseAI/`) exposes `runChat`/`runFinalize`; frontend is
  `app/_components/Course/components/AIChatBuilderDialog/` (`ToolCallIndicator`, `ConfidenceBadge`).
- **`confidence_score`'s prompt has a floor rule that overrides its own bands.** "If EXTRACTED DATA has
  all required fields… score at least 0.85" fires on any non-empty value, including a one-word
  objective, and therefore beats the 0.7–0.9 band written for "generic titles, few lessons". Changing
  the bands without removing the floor changes nothing — this was measured, not reasoned.
- **The eval's green light and the node's correctness were different things until 2026-09-03.** The
  golden set's `history` field carried the author's own annotation ("vague curriculum"), perfectly
  correlated with `expected.complete`, so the node was scoring a leaked label rather than the data.
  The set is repaired and `confidenceScoreDataset.contract.test.ts` pins the shape; the 73.3% is what
  the node has been doing all along, first visible once the leak was closed.
- **Never quote this node's accuracy without saying which set it came from.** Numbers taken before
  2026-09-03 (91.7%) and after (73.3%) measure different questions, and the earlier one is not a
  baseline to regress against.
- **Do not "fix" this node by moving `CONFIDENCE_THRESHOLD`.** The constant is 0.8 in
  `graph/nodes/confidenceScore.ts` and is documented in three places; the measured defect is a floor
  rule inside the prompt, and a cut point cannot repair a ranking. If a future run shows a false
  positive outscoring a true row, the answer is a different scoring instruction — or a different
  signal — not a higher bar.
- **The golden set is off-limits to the prompt.** Rows 04, 06, 08 and 18 are the fixture this work is
  measured against; naming their content in the prompt turns the eval into a lookup. A contract test
  enforces this, so it does not depend on anyone remembering.
- See ADR-016 for the full graph design and the alternatives considered.