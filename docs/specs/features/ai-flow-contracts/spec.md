---
feature: ai-flow-contracts
status: stable
models: []
depends-on: [ai-course-builder, ai-input-trust-boundary]
---

## Purpose

The two LangGraph AI flows — `courseAI` (13 nodes, 7 route predicates) and `learningPathAI` (7 nodes
plus the `decideStrategy` predicate) — carry no record of their own contract. Nothing states what a node reads from state, what it writes,
how it fails, or what the instructor sees when it does; `graph.ts` has one comment, and the feature
spec covers the flow in a paragraph. Anyone changing a node reverse-engineers the state shape from ten
files first, and a reviewer cannot tell a correct change from a subtly wrong one.

The same gap exists at runtime. `withNodeErrors` collapses every failure into one `CourseAIError` and
the route turns that into a single generic toast, so a provider timeout, a malformed structured output
and a programming bug are indistinguishable — in the logs, to support, and to the instructor, who is
never told whether retrying is worth it. That indistinguishability is also what makes a failure-rate
metric impossible, which is why this work blocks the observability workstream
(`ai-hardening-plan.md` §4).

This feature makes both graphs self-describing and their failures distinguishable.

## Functional scope

- `docs/specs/features/ai-flow-contracts/graph-contract.md` is the single contract document for both
  graphs. For each `courseAI` node: purpose, state fields read, state fields written, outgoing edges,
  failure mode, and whether it calls an LLM (with the model id). For each of the 6 route predicates:
  the state field it branches on, every branch label, and the target node.
- The same document carries a shorter `learningPathAI` section: one row per registered node (purpose,
  reads, writes, failure) plus a row for the `decideStrategy` route predicate, with no diagram and no
  separate failure matrix.
- A mermaid diagram of the `courseAI` graph in `graph-contract.md`, with the conditional routes
  labelled — the six branch points are the part of the flow that reading `graph.ts` top-to-bottom
  does not convey.
- A JSDoc block on every node module in `courseAI/graph/nodes/` and `learningPathAI/nodes/`, with four
  labelled lines: purpose, reads, writes, fails. It lives next to the code so it cannot rot silently
  while the node changes.
- A **failure matrix** section covering five scenarios — low confidence (`< 0.8`), validation failure,
  tool call that never returns, invalid structured output, and guard block. Each row states the system
  behavior, what the instructor sees, and what persists.
- `courseAI` node errors are typed: `RetryableNodeError` (provider timeout, rate limit, network) and
  `FatalNodeError` (invalid structured output, programming error) replace the blanket `CourseAIError`
  thrown by `withNodeErrors`. Classification happens in one place; every node inherits it by being
  wrapped.
- A node failure logs the node name and the error kind structurally, and never logs the provider's raw
  message to the client.
- `app/api/chat/course/route.ts` maps the kind onto the SSE `error` event: `retryable: true` with
  try-again copy, `retryable: false` with the existing generic copy. `StreamEvent` and `isStreamEvent`
  carry the field as *optional* — the client drops any event failing the guard, so requiring it would
  turn a stale server's error into silence rather than a generic toast.
- A contract test (`graph-contract.test.ts`, unit) enforces the document against the code: every node
  registered in `graph.ts` has a row, every route predicate has a row, and every node module has a
  JSDoc block with all four labels. A node added without documentation fails CI.
- [`chain-contract.md`](chain-contract.md) is the same document for the two surfaces that are neither
  graphs nor the tutor: `quizAI` (15 stations) and `lessonInsightsAI` (15 stations), each with a
  persistence rule and a failure matrix, plus one shared table mapping the brief's sixteen flow steps
  onto both. Enforced by `chainContract.contract.test.ts`: a tool module, a chain module, a
  model-facing tool name, or a step module without a row fails CI, as does dropping either
  persistence section or a row from the sixteen-step table.

## Acceptance criteria

- Every node module in `courseAI/graph/nodes/` and `learningPathAI/nodes/` opens with a JSDoc block
  containing all four labels (purpose, reads, writes, fails) — proven by a test that parses the
  sources, so a new undocumented node fails CI rather than merging.
- Every node name registered in `courseAI/graph/graph.ts` and every one of the 6 route predicates has
  a row in `graph-contract.md`; adding a node or a branch without a row fails CI.
- The failure matrix documents all five scenarios, and each row matches observed behavior:
  a validation failure routes to `clarify` (not END) and persists nothing; `confidence < 0.8` ends the
  stream with `done` and the UI shows the Accept button; a guard block emits `guard_blocked` and writes
  no `CourseGenerationMessage` row.
- A provider timeout, a rate-limit response, or a network fault raised inside a wrapped node that
  propagates surfaces as `RetryableNodeError`; a structured-output parse failure or a `TypeError`
  surfaces as `FatalNodeError`. Classification reads the error's shape — `name`, `constructor.name`,
  `lc_error_code`, `status` — because the openai SDK assigns none of its classes a `name` and
  LangChain rewrites the rest before a node sees them.
- A client abort is never classified as either — it is rethrown unwrapped and unlogged, so aborts do
  not pollute the failure signal. Both shapes count: a real `AbortError` from the streaming nodes and
  `@langchain/core`'s `ModelAbortError`, which every `.invoke()` node produces under `streamEvents`.
- `classify_intent` and `assess_completion` swallow their own model errors and fall back to a default
  verdict, so no error escapes them to classify. The contract table and failure matrix record that
  silent fallback as their documented failure mode; this feature does not change it.
- A retryable node failure emits `{ type: "error", retryable: true }` with try-again copy; a fatal one
  emits `retryable: false` with the generic copy. Neither event body contains the provider's message,
  the node's internals, or a stack trace.
- No node failure closes the SSE stream without an `error` event first.
- Every node failure log line carries the node name and the error kind as structured fields — the
  precondition for the failure-rate metric in `ai-hardening-plan.md` workstream D.
- Happy-path behavior is unchanged: no change to routing, to the 0.8 auto-advance threshold, to which
  nodes emit `node_start`, or to what is persisted. The existing `courseAI` and `learningPathAI` test
  suites pass untouched.

## Agent notes

- **`tool_node` is LangGraph's prebuilt `ToolNode`**, not a project module. It gets a row in the
  contract table but has no JSDoc site — the contract test must exempt it by name, the same way
  `entryPoints.ts` carries `EXEMPT_MODEL_CALLERS`.
- **`routeAfterValidate` sends `fail` to `clarify`, not to END.** A failed Zod validation is surfaced
  to the instructor as a clarifying question and nothing is persisted. Documenting it as an error path
  would misdescribe it.
- **`pendingToolCalls` is reset on every `toolRouter` pass; `toolCalls` accumulates.** The route
  predicate reads `pendingToolCalls` deliberately. The contract table must record this, since reading
  the accumulating field instead is a silent infinite-loop bug.
- **`confidence_score` reads history filtered to `state.currentStep`** (ADR-016). The table must say
  so — an unfiltered history suppresses the score below 0.8 and breaks auto-advance without any test
  failing.
- **No tool call has a timeout today.** A tool that never returns holds the SSE stream until the
  client aborts. The matrix documents that as the actual behavior; adding a timeout belongs to
  workstream D (`ai-hardening-plan.md` §5 defers retry/timeout work until metrics exist), not here.
- **`decideStrategy.node.ts` exports two symbols** — the `decideStrategy` predicate and
  `setSkipLLMIfEmpty` (registered as the node `setSkipLLM`). JSDoc lookup must key on
  (file, exported symbol), not on file, or one of the two silently goes undocumented while CI passes.
- **Do not "simplify" the classifier back to `err.name` or `instanceof`.** The openai SDK never sets
  `this.name`, so a network fault reads as `name: "Error"` with `status: undefined`, and `openai` is
  not a direct dependency, so its classes cannot be imported for `instanceof` at all. A fixture that
  fabricates a `name` will make a broken classifier look correct — that is exactly how the first
  implementation shipped a bug past its own green test.
- **The four `courseAI` tools never throw** — each catches internally and returns a JSON
  `{ error: "..." }` string. So `tool_node` failures arrive as tool *output*, not exceptions; the only
  realistic exception on that path is LangGraph rejecting the model's tool arguments, which reaches the
  route unclassified and therefore reads as non-retryable.
- **`learningPathAI` has no `withNodeErrors`** — its nodes throw domain errors directly
  (`CourseUnavailableError`, `LearningPathInvalidError`). Typed retryable/fatal errors are `courseAI`-
  only in this workstream; do not generalize the wrapper to a second graph as a drive-by.
- **The guard-block row links to `ai-input-trust-boundary/spec.md`, it does not restate it.** Two
  copies of the persist-nothing-on-block rationale will diverge.
- Classification must key off provider error shape (status code, error name), not off message
  substrings — provider copy changes without notice, and a misclassified fatal error shown as
  "try again" trains instructors to retry a bug forever.
- The contract document earns its keep on state I/O and failure modes, which the code states nowhere.
  Do not pad it with restatements of what a node's name already says.

## Out of scope

- Retry logic in nodes, and tool-call timeouts — `ai-hardening-plan.md` §5 defers both until
  workstream D shows what actually flaps.
- AI metrics, latency budgets, cost and failure-rate tracking — workstream D.
- `lessonAI` — a chain, not a graph, so it has no *node* contract to document here. It got its own
  station contract instead: [`../ai-tutor-guardrails/flow-contract.md`](../ai-tutor-guardrails/flow-contract.md).
  (`quizAI` and `lessonInsightsAI` were listed here for the same reason and are now covered by
  [`chain-contract.md`](chain-contract.md) below — "no node contract" was never the same claim as
  "nothing to document", and reading it that way left two surfaces undocumented for a month.)
- Rewriting ADR-016's flow diagram; `graph-contract.md` is the detailed view, the ADR keeps the
  decision-level one.
- Typed node errors for `learningPathAI`.