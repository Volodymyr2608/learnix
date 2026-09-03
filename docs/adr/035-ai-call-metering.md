# ADR-035: Meter AI calls at the run root, into logs, not into a table

- **Status**: Accepted
- **Date**: 2026-09

## Context

Five feature specs (`ai-tutor-guardrails`, `ai-course-builder`, `quiz-generation`, `learning-path`,
`study-guide`) each carried the same paragraph: *"Not measured, and this is a stated gap rather than
an omission. There is no p95 latency budget, no per-turn token ceiling and no cost ceiling."* The
ceilings that did exist — rate limits, context windows, recursion caps, the 30 s call timeout and the
120 s turn deadline ([ADR-027](027-distributed-ai-rate-limiting.md), `aiLimits/modelDefaults.ts`) —
bound *volume and prompt size*, not spend. A change that lengthens a system prompt or adds a tool
round-trip moves cost without touching any number anyone tracked.

Two assets already existed and shaped the decision. `evals/_shared/cost.ts` priced an eval run from
`usage_metadata` and a per-model table ([ADR-031](031-eval-fidelity-and-baselines.md)), so production
needed a reader and a price table that already worked. And `error-observability`
([ADR-029](029-error-reporting-projection-funnel.md)) had already established that Sentry owns errors
and LangSmith owns AI traces, that `logger.error` is the sole Sentry chokepoint, and that a telemetry
event's field set should be closed *by type* rather than redacted.

## Decision

### 1. One callback handler, attached at the run root — not a wrapper at each call site

`aiMetricsHandler` is a `BaseCallbackHandler` placed once in the `RunnableConfig` at each run root.
LangGraph propagates that config into every node, and every node already forwards it to
`model.invoke`, so a single attachment meters `classify_intent`, `chat_response`, `assess_completion`,
`extract_step_data`, `validate`, `confidence_score`, `revise_prior_field` and `tool_router` without
any of them changing. **No file under `courseAI/graph/` was modified by this feature**, and a contract
test asserts none ever mentions `aiMetrics`.

The rejected alternative — `withMetrics(...)` around each `model.invoke` — is the drift class this
codebase repeatedly converts into contract tests: it needs a step at every call site, and every new
node is a fresh chance to forget. Here the roots are a closed set of eight that changes only when a
surface is added.

### 2. The handler implements `handleChatModelStart`, never `handleLLMStart`

This is a security control, not a style choice. LangChain's callback manager falls back to
`handleLLMStart` **only** when the chat hook is absent, and that fallback runs `getBufferString` over
every message — materialising the fully rendered prompt, untrusted course and student text included.
Implementing the chat hook means the string is never built at all, which is stronger than declining
to read it. A test pins the absence, so a future author adding even a no-op `handleLLMStart` goes red.

### 3. Structured logs, not an `AiCallMetric` table

A row per model call buys SQL aggregation at the price of a database write on every call. Every
question this feature exists to answer — which operation is most expensive, which calls are slow or
failing, what a turn costs — is answerable from structured `logger.info` lines. The model gets built
when in-app aggregation is actually needed. This mirrors two decisions already on the record:
`error-observability` deliberately runs `tracesSampleRate: 0` rather than duplicating LangSmith, and
`logSecurityEvent` forwards only three of nine outcomes.

### 4. Metrics are `info`, and the field set is closed by type

`logger.error` is the single Sentry chokepoint, and the free tier is 5 000 events a month; one line
per model call at `error` level would exhaust it during normal operation and blind the platform to
real errors. `AiMetricCall` and `AiMetricTurn` declare no field whose type admits a prompt, a reply,
a tool argument, or an `Error.message` — the enforcement mechanism `logSecurityEvent` already uses,
chosen for the same reason: a redaction step can be forgotten, a missing field cannot. No identifier
is emitted at all (see `ai-observability/security.md` §S7).

### 5. The turn's handler is built in the route, before the input guard

L2 topic relevance is a model call on every turn of both chat surfaces. A handler built inside the
service cannot see it, cannot see a turn the guard *blocks* (the route returns first), and starts the
latency clock after a wait of up to L2's 3 s budget that the student has already spent. Building it
in the route fixes all three. `GuardContext.metrics` is **required**, so a caller that omits it
cannot compile — an optional field there is a silent unmetering.

### 6. The summary is enqueued, never written inline

`BaseCallbackHandler` defaults `awaitHandlers` to `false`, so LangChain hands every hook to
`consumeCallback`, which queues it on a process-global queue of concurrency 1 **without awaiting**.
`handleLLMEnd` therefore does not run inside the model call. A turn summary written synchronously
from a service's `finally` overtakes the very calls it totals and reports `calls: 0, costUsd: 0`
whenever another turn holds the queue slot. `emitSummary` enqueues onto the same FIFO so it drains
behind its own call callbacks.

This is recorded as a decision rather than a bug fix because the obvious implementation is the wrong
one, it passes every unit test, and it passes a real single-call smoke test — an idle queue starts
the job synchronously. The failure appears only under concurrency, which is the condition the metric
exists to observe.

### 7. A turn that spent money never reports `$0.00`

`usageCost` returns `null` for an unpriced model, and a turn containing any unpriced, aborted, or
never-completed call reports `null` rather than the sum of the priced remainder. The worst case in
the system — a turn hitting `TURN_DEADLINE_MS` after chaining node calls — would otherwise read as
free.

## Consequences

**Positive**
- The "Not measured" paragraph can be deleted from five specs once baselines are recorded.
- A new graph node is metered with no action from its author.
- `evals/` and `server/` price a call from one table, so an eval's answer and production's answer
  cannot disagree.
- quizAI's retry fan-out is visible as a turn's total cost for the first time.

**Negative / Trade-offs**
- **No correlation id.** No `userId`, `runId` or turn id is emitted, so a call line cannot be joined
  to its turn line and two concurrent turns on the same surface interleave indistinguishably.
  Aggregate questions are answerable; per-turn forensics are not.
- **Embeddings are unmetered.** LangChain's `Embeddings` base class exposes no callback surface and
  `OpenAIEmbeddings` discards the API's `usage`, so `search` and the reindex backfill sit outside this
  mechanism entirely (`security.md` §S9).
- **Per-attempt attribution is absent** where a surface uses a ReAct agent: every line reads
  `node: "agent"`.
- Log volume grows by one line per model call plus one per turn.

## Alternatives considered

- **`AiCallMetric` Prisma model.** Rejected as speculative — see §3. It also makes the classifier's
  verdict `guarded` for a new model plus a migration, which is real ceremony bought for aggregation
  nobody has asked for yet.
- **`super({_awaitHandler: true})`** instead of enqueuing the summary. Fixes the ordering too, and is
  simpler — but moves the write inline into every model call including L2's, which would invalidate
  the false-positive measurement `security.md` §S3 depends on.
- **Turning LangSmith on** rather than building this. LangSmith is the accepted trace system
  ([ADR-013](013-langsmith-tracing-evals.md)) and remains so; it is disabled in production, its
  streaming wrapper is unverified, and traces are not a substitute for a queryable per-call cost
  figure in the application's own logs.

## References

- [`docs/specs/features/ai-observability/spec.md`](../specs/features/ai-observability/spec.md) and its
  [`security.md`](../specs/features/ai-observability/security.md).
- [ADR-029](029-error-reporting-projection-funnel.md) — Sentry owns errors, LangSmith owns AI traces;
  the allowlist-projection discipline this feature's field set follows.
- [ADR-013](013-langsmith-tracing-evals.md) / [ADR-031](031-eval-fidelity-and-baselines.md) — the eval
  cost machinery whose price table moved into `server/`.
- [ADR-030](030-tiered-agentic-development.md) — the classifier that made this a `guarded` change on
  one modified control.
