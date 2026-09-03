---
feature: ai-observability
status: in-progress
models: []
depends-on: [error-observability, ai-flow-contracts, ai-evaluation-harness]
---

## Description

Every model call this application makes is currently unmeasured: nothing records how long it took,
how many tokens it consumed, or what it cost. This feature attaches a single LangChain callback
handler at each run root, which emits one structured log line per model call and one summary line per
turn — latency, prompt/completion tokens, approximate USD, and an outcome — and it makes the price
table that `evals/` already owns the one table both the eval runner and the server read.

It adds no database model, no environment variable, no new external service, and no user-visible
behaviour. Nothing about what a student or instructor sees changes.

## Business goal

Five feature specs (`ai-tutor-guardrails`, `ai-course-builder`, `quiz-generation`, `learning-path`,
`study-guide`) each carry the same paragraph: *"Not measured, and this is a stated gap rather than an
omission. There is no p95 latency budget, no per-turn token ceiling and no cost ceiling."* Those
sentences are the deliverable this feature exists to delete.

Concretely, three questions cannot be answered today and are answerable the day this ships: which AI
operation costs the most, which model calls are slow or failing, and what one turn of each flow
actually costs. Until they are answerable, the ceilings that *do* exist (rate limits, context
windows, recursion caps) bound volume and prompt size but not spend — and a change that lengthens a
system prompt or adds a tool round-trip moves cost without touching any number anyone tracks.

The second goal is cheaper to state: `evals/_shared/cost.ts` already prices a run, and a second price
table in `server/` would drift from it. One table, two readers.

## Supported use cases

- Every chat-model call on the five AI surfaces (`courseAI`, `lessonAI`, `quizAI`,
  `lessonInsightsAI`, `learningPathAI`) emits one metric line carrying its latency, token counts,
  approximate cost, model, owning node, and outcome.
- The L2 topic-relevance guard (`checkTopicRelevance`) — a model call that runs before every tutor
  turn — emits the same line, so the tutor's real per-turn call count is two, not one.
- Each turn emits one summary line: call count, summed tokens, summed cost, wall time, and
  time-to-first-token for the streaming flows.
- A call to a model with no recorded price reports `costUsd: null` and the turn's total as unknown,
  rather than reporting `$0.00`.
- `evals/` and `server/` read the same price table and the same `usage_metadata` reader; changing a
  price changes both.
- A failed call is distinguishable from a slow one and from a client who navigated away: outcomes are
  `ok`, `retryable_error`, `fatal_error`, `aborted`.

## Unsupported use cases

- **No `AiCallMetric` Prisma model, no table, no migration.** A row per model call buys SQL
  aggregation at the price of a database write on every call. Structured logs answer every question
  in Business goal; the model gets built when in-app aggregation is actually needed, not before.
- **No custom dashboard.** The deliverable is a structured log queryable where logs already go.
  LangSmith remains the accepted AI-trace system (ADR-013); turning it on in production is a separate
  piece of work, and it is deliberately not bundled here.
- **No embeddings metering** — `search`, and the `pnpm reindex` backfill. Two reasons, both
  structural rather than a matter of effort: LangChain's `Embeddings` base class exposes **no
  callback surface at all** (`@langchain/core/dist/embeddings.d.ts` is an `AsyncCaller` and nothing
  else), so the mechanism this feature is built on cannot reach it; and `OpenAIEmbeddings` returns
  bare vectors, discarding the API's `usage`, so tokens there could only ever be *estimated* from
  text length. `AiFeature` is also a closed union of the five chat surfaces and does not include
  `search`. Named as a gap in [`security.md`](security.md) §S9 rather than silently omitted.
- **No new environment variable and no on/off toggle.** Metrics are always on. A toggle would be a
  new authority signal, and a metric nobody can rely on being present is not a baseline.
- **No alerting.** Thresholds and alert routing need a denominator this feature produces but does not
  yet consume.

## Inputs

The feature reads from the LangChain callback stream, not from user data. Every input is
**machine-generated telemetry about a call**, never call content.

| Channel | Trust | Boundary |
|---|---|---|
| `handleLLMStart(llm, prompts, runId, …)` | **untrusted — and never read** | `prompts` carries the fully rendered prompt, including untrusted course and student text. The handler reads `runId` and the model id only; there is no code path that reads `prompts`. |
| `handleLLMEnd(output: LLMResult, runId, …)` | **untrusted content, trusted metadata** | Only `output.generations[][].message.usage_metadata` (two integers) and the model id are read. Message content is never read. |
| `handleLLMError(err, runId, …)` | **untrusted** | Three LangChain constructors put raw model output into `Error.message` (`OutputParserException`, `ToolInputParsingException`, `InvalidUpdateError`). Only `err.name` is read — never `message`, at any depth. |
| Call-site context (`feature`, `userId`, `courseId`, `node`) | trusted | Supplied by the service constructing the handler, from values it already holds. |

## Outputs

Two log lines, both through `server/utils/logger.ts` at `info` level, both with a field set that is
**exhaustive by type** — there is no field through which text could be passed.

**Per call** (`[aiMetrics] call`):

| Field | Type |
|---|---|
| `feature` | `AiFeature` (five-member union) |
| `node` | `string` — the LangGraph node name, or a declared constant for a non-graph call |
| `model` | `string` |
| `latencyMs` | `number` |
| `promptTokens` / `completionTokens` | `number` |
| `costUsd` | `number \| null` — `null` means the model is unpriced |
| `outcome` | `"ok" \| "retryable_error" \| "fatal_error"` |
| `errorName` | `string \| undefined` — the error's class only |

**Per turn** (`[aiMetrics] turn`): `feature`, `calls`, `promptTokens`, `completionTokens`,
`costUsd` (`null` when any call in the turn was unpriced), `wallMs`, `ttftMs` (streaming flows only),
`outcome`.

Consumer: whatever reads process stdout. Nothing reaches Sentry — see Observability.

## Validation

- **Token counts** are read through `usageOfMessage()`, which tolerates a missing `usage_metadata`
  and yields `0` rather than throwing. A provider that stops returning usage degrades to zeroes, not
  to a crash.
- **Cost** is computed by `usageCost()`, which returns `null` for a model absent from the price
  table. `null` propagates into the turn total as "unknown". A silent `$0.00` is treated as a defect,
  not a default.
- **Outcome classification** reuses the existing `classifyNodeError` shape rules (`lc_error_code`,
  error name, constructor name, `status >= 500`), which fail closed: an unrecognised shape is
  `fatal_error`, because an unknown shape is far likelier a bug here than a transient provider fault.
- **Aborts** are filtered by the existing `isNodeAbort` before any classification runs.
- There is no model-output validation in this feature — it reads no model output.

## Acceptance criteria

Applies: [`docs/constitution.md`](../../../constitution.md) — standing constraints inherited, not
retyped. Security controls: [`security.md`](security.md).

1. `server/services/_shared/aiMetrics/pricing.ts` holds exactly one `PRICES` table, and
   `evals/_shared/cost.ts` imports from it. A repository-wide scan finds no second per-model price
   literal.
2. `usageCost()` returns `null`, never `0`, for a model absent from the table; a turn containing an
   unpriced call reports its total as unknown.
3. A metric line is emitted for every chat-model call on all five surfaces, and for the L2 guard.
   A contract test scans each attachment site and fails if a run root stops passing the handler.
4. The per-call line carries exactly the fields listed in Outputs — no more, no fewer.
5. One turn summary is emitted per turn, on every exit: normal completion, error, and abort.
6. **No free text is emittable.** The event type has no field whose type admits a prompt, a reply, or
   an error message; a contract test asserts every emitted value is a primitive scalar.
7. An error line carries `err.name` only. A test throwing an error whose `message` holds a marker
   asserts the marker appears nowhere in the emitted payload.
8. A client abort emits **no** error line, and emits a turn summary with `outcome: "aborted"`.
9. **A throwing logger cannot fail a turn.** With the logger stubbed to throw on every call, a tutor
   turn and a courseAI turn still complete and still return their content.
10. Nothing in `server/services/_shared/aiMetrics/**` calls `logger.error`, so no metric can reach
    Sentry or consume its event quota.
11. Attaching the handler to `checkTopicRelevance` does not change its verdict, its 3 s timeout, or
    its fail-open behaviour: an on-topic message is still allowed, an off-topic one still blocked, and
    a timeout still yields `fallback_triggered` with `ruleIds: ["l2_unavailable"]`.
12. A streaming call reports non-zero `promptTokens` — proving usage is read from the aggregated end
    message, not from the first chunk.
13. `ttftMs` is recorded for the streaming flows and absent (not zero) for non-streaming ones.
14. Metering a courseAI turn produces one line per node that calls a model, each carrying that node's
    name — so a slow or expensive node is identifiable without reading the code.

## Edge cases

- **A turn that makes zero model calls** (guard blocks at L1, or a cached insights hit) emits a turn
  summary with `calls: 0` and no per-call lines. Suppressing it would make "blocked turns" invisible
  in the denominator.
- **A retried call.** `MODEL_MAX_RETRIES = 2` means the provider client retries internally; LangChain
  reports one logical call, so retries do not inflate the call count. Recorded here because the
  number will otherwise look wrong to whoever reads the baseline first.
- **A turn exceeding `TURN_DEADLINE_MS` (120 s)** surfaces as an abort on the combined signal — the
  summary carries `outcome: "aborted"`, which is indistinguishable from a user navigating away. Named
  as a known limit rather than solved.
- **Concurrent turns in one process.** State is keyed by `runId` inside a per-turn handler instance;
  handlers are never shared between turns.
- **A node that calls the model twice** (`tool_router` looping) produces two lines with the same
  `node` value. Correct: the loop count is the thing worth seeing.
- **`quizAI`'s three generation attempts** produce three call lines within one turn summary — which is
  the first time that amplification is visible as a number.

## Failure & fallback

| Failure | User sees | Persisted | Emitted | Direction |
|---|---|---|---|---|
| Model call errors | Unchanged — existing handlers own the response | Nothing | Call line with `retryable_error` / `fatal_error` + `errorName`; turn summary | Fail-open (metrics never alter control flow) |
| Client aborts | Nothing (gone) | Nothing | Turn summary, `outcome: "aborted"`; **no** error line | Fail-open |
| Logger throws | Unchanged — turn completes | Nothing | Nothing; the metric is lost | **Fail-open, and this is the point** — the meter must never break the path it measures |
| `usage_metadata` absent | Unchanged | Nothing | Line with zero tokens and `costUsd` computed from zero | Fail-open |
| Model unpriced | Unchanged | Nothing | Line with `costUsd: null`; turn total unknown | Fail-open, loudly |
| L2 guard times out | Existing behaviour: turn allowed, `fallback_triggered` | Nothing | Call line with `retryable_error` | Unchanged — this feature must not move it |

## Security

Complex tier: see [`security.md`](security.md). In one line: this feature introduces **no new
authority** — it adds a read-only observer to calls that already happen — and modifies **one existing
control surface** by attaching that observer inside `server/services/_shared/aiGuard/`. Controls for
the surfaces themselves are inherited by reference from
[`ai-tutor-guardrails/security.md`](../ai-tutor-guardrails/security.md) and
[`error-observability/security.md`](../error-observability/security.md); the one new residual is that
a log line is a disclosure channel, which is why the field set is closed by type rather than
redacted.

## Performance

**Overhead budget.** The handler does arithmetic and one `logger.info` per call. Target: **< 1 ms**
added per model call, against a 3 s L2 budget and a 30 s per-call timeout — i.e. under 0.04% of the
smallest existing budget. No network I/O, no `await` on a sink, no serialization of message content.

**What this feature measures rather than declares.** The p95 budgets, per-turn token ceilings and
cost ceilings that five specs list as "Not measured" are filled *after* this ships, from its baseline.
Writing them here as targets first would be inventing numbers, which is the failure mode
[`ai-eval-strategy.md`](../../ai-eval-strategy.md) and `docFigures.ts` exist to prevent.

**Bounds this feature inherits and must not move** (`aiLimits/modelDefaults.ts`, `topicRelevance.ts`):
one call 30 s with 2 retries; one turn 120 s; graph recursion 25, agent recursion 12; L2 relevance
3 s with 1 retry; `lessonAI` 20 req/min per user with a 30/min cross-feature aggregate.

**Log volume.** One line per model call plus one per turn. A courseAI turn is ~6–8 nodes, so ~9 lines;
a tutor turn is 2 calls, so 3 lines. Bounded by the rate limits above, not by this feature.

## Observability

This feature *is* the observability, so what matters is what it does **not** emit and where it does
not send it.

- **Destination is stdout only.** Metrics are emitted at `info`. `server/utils/logger.ts` forwards
  **only** `error`-level entries to Sentry via `reportError`, so no metric consumes the 5 000-event
  free tier. AC 10 makes that structural rather than conventional.
- **Structurally excluded, not redacted:** prompt text, reply text, tool arguments, tool results,
  retrieved RAG content, `Error.message`. None of these has a field in the event type — the same
  enforcement mechanism `logSecurityEvent` uses, chosen for the same reason: a redaction step can be
  forgotten, a missing field cannot.
- **Field vocabulary is shared, not parallel.** `feature`, `node`, `courseId`, `userId` are spelled as
  `projectError.ts`'s allowlist spells them, so a Sentry issue and a metric line about the same turn
  join on the same keys.
- **Relationship to the two existing streams.** `logSecurityEvent` owns guard and validation outcomes;
  this owns latency, tokens and cost. They deliberately do not overlap: `guard_blocked` is **not** an
  `aiMetrics` outcome, because emitting it in both streams would double-count the same event. A
  failure-rate that needs both joins them on `feature`.
- **What remains invisible after this ships:** embeddings cost (Unsupported use cases), and everything
  below `error` that does not throw — `error-observability/security.md` §S16's named gap is narrowed
  by this feature but not closed.

## Test & eval scenarios

**Unit** (`*.test.ts`, no DB, no network):
- `usageCost` returns `null` for an unpriced model and a correct figure for a priced one (AC 2).
- `usageOfMessage` tolerates a missing `usage_metadata` (Validation).
- Outcome classification: retryable shapes vs fatal vs abort, reusing `nodeErrors`' fixtures (AC 8).
- Turn accumulator: totals, `calls: 0`, unknown total when any call is unpriced (AC 5, Edge cases).

**Contract** (`*.contract.test.ts` — the repo's mechanism for a rule that must not decay):
- Every run root still passes the handler; a service that stops attaching it fails CI (AC 3).
- The emitted payload contains only primitive scalars (AC 6) — the idiom
  `aiLogShape.contract.test.ts` already uses.
- No second price table exists anywhere in the repo (AC 1).
- No `logger.error` inside the `aiMetrics` module (AC 10).

**Behavioural** (driving the real services with a mocked model):
- A marker in `Error.message` appears nowhere in the emitted payload (AC 7).
- A stubbed-throwing logger does not fail a tutor turn or a courseAI turn (AC 9).
- An aborted stream emits a turn summary and no error line (AC 8).
- A streaming call reports non-zero `promptTokens` (AC 12).

**Guard regression — recall *and* false positive** (AC 11), the pairing `documentation-process.md`
§3d requires for a modified control: an off-topic message is still blocked, an **on-topic message is
still allowed**, and an L2 timeout still fails open with `fallback_triggered` /
`["l2_unavailable"]`.

**Evals.** This feature adds no eval set and changes no prompt, so `evals/` is untouched. It is what
makes the *next* eval comparison (area-4 З3, full history vs structured summary in
`confidenceScore`) able to report tokens and cost alongside the existing calibration score.

## Source of truth

- Behavior now: this file.
- Threats and residuals: [`security.md`](security.md).
- Decisions: an ADR is required at `/qa` (the logs-not-a-table choice and the handler-at-the-root
  choice both meet the three-month test).
- Prices and the usage reader: `server/services/_shared/aiMetrics/pricing.ts` — the table, not this
  document, is where a price is looked up.
- Existing bounds this feature measures against: `server/services/_shared/aiLimits/modelDefaults.ts`,
  `server/services/_shared/aiGuard/topicRelevance.ts`.
- Correctness: the tests named above.
- Build history (frozen, never updated): `build/plan.md`.

## Agent notes

- **The handler is attached once, at the run root — never per call site.** `withNodeErrors` and every
  courseAI node forward their `config`, and `confidenceScore` passes it into `model.invoke`, so a
  handler in the graph's `RunnableConfig` reaches every node automatically. A future node is
  instrumented for free; do not "fix" this by adding wrappers at call sites.
- **`checkTopicRelevance` is the exception** and must be attached separately: it constructs its own
  `ChatOpenAI` and runs *outside* both graphs, which is why it is listed in `SHARED_MODEL_CALLERS`.
  Forgetting it undercounts the tutor by one call in two.
- **`streamUsage` is already `true`** by default in `@langchain/openai` (`chat_models/base.js`), so
  `stream_options: {include_usage: true}` is already sent. Do not add it. The work is reading usage
  off the aggregated end message, not enabling it.
- **`logger.error` is the Sentry chokepoint.** Emitting a metric at `error` level would flood a
  5 000-event/month tier. This is why AC 10 exists as a contract test rather than a comment.
- **`guard_blocked` deliberately has no home here.** It belongs to `logSecurityEvent`. If a future
  change adds it, the same block is counted twice.
- **`AiFeature` is a closed five-member union** shared with `logSecurityEvent` and `AI_SURFACES`.
  Widening it to fit `search` would ripple into both plus their contract tests — which is one of the
  two reasons embeddings are out of scope.
- Adding a price to `PRICES` updates the eval runner's cost report at the same time. The table carries
  a "checked" date for a reason: prices go stale, and an unpriced model must read as unpriced.
