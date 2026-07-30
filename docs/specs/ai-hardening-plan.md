# AI hardening plan — remaining workstreams

> **What this is:** a roadmap-level document, not a feature spec. It breaks a technical-assessment
> review into workstreams; each one that reaches implementation gets its own
> `docs/specs/features/<slug>/spec.md` under ADR-021.
>
> **Created:** 2026-07-20 · **Revised:** 2026-07-30, when workstreams A and B shipped and their
> planning sections were removed. The original — including the pre-guard audit of the AI subsystem and
> the task-level plan for A — is in git history; ADR-022 and the two feature specs superseded it.

---

## 1. Where this came from

The review raised four themes. Each was checked against the code before planning, because they were
not equally open.

| # | Theme | Status |
|---|---|---|
| **A** | Prompt injection, jailbreak, topic relevance | ✅ **Shipped** — [`features/ai-input-trust-boundary/spec.md`](features/ai-input-trust-boundary/spec.md), [ADR-022](../adr/022-ai-input-trust-boundary.md) |
| **B** | AI flow documentation (nodes, I/O, failure cases) | ✅ **Shipped** — [`features/ai-flow-contracts/spec.md`](features/ai-flow-contracts/spec.md) |
| **C** | Spec process, source of truth | ⬜ **Open** — §2. Mostly solved by ADR-020/021 already; two real gaps left |
| **D** | Latency, tokens, cost, failure rate | ⬜ **Open** — §3. LangSmith is wired but tracing-only and off by default; no metrics |

**Why C ranks lowest.** Commit `25f225f` (spec-gated command chain, ADR-021) and ADR-020 already close
most of that recommendation — the feature-spec template, change tiering, and the "no plan, no code"
gate. The reviewer most likely assessed the state *before* those commits. What remains is two specific
omissions, not a workstream. The work is not to rebuild what stands, but to be able to show that it
stands.

---

## 2. Workstream C — spec process (P2, half-day)

Not a workstream; one focused PR. Already in place: ADR-020, ADR-021,
`docs/templates/feature-spec.md`, `_index.md`, `pnpm spec:sync`.

**Gap 1 — shared acceptance criteria.** Create `docs/specs/common-acceptance-criteria.md` holding the
criteria that apply to *every* feature and should therefore stop being retyped into each spec: project
structure (ADR-011), style (Biome), error handling (ADR-010), security (ADR-016 and ADR-022), tests
(ADR-018). The template then carries one line: "Applies: common AC + the feature-specific ones below."

**Gap 2 — source of truth after release.** Add an explicit section to
[`documentation-process.md`](documentation-process.md): once merged, the source of truth is `spec.md`
(current behavior) plus the ADR (why it is that way). `build/plan.md` becomes history and is not
updated. The code is the truth about implementation, `spec.md` about intent — and a divergence between
them is a bug in the spec, not in the code.

**Gap 3 — template extension.** Add `Inputs / Outputs`, `Edge cases`, and `Non-functional
requirements` (latency, cost, limits) to `docs/templates/feature-spec.md`.

---

## 3. Workstream D — performance & observability (P1)

### 3.1 The gap

LangSmith is wired up but tracing-only and off by default (`LANGSMITH_TRACING`, `lib/env.js:27`), with
no metrics, no latency budgets, and no alerts. There is currently no answer to "what does one
generated course cost?"

Workstream B removed the blocker: node failures are now typed `RetryableNodeError` / `FatalNodeError`
and logged with `{feature, node, kind}`, so a failure-rate metric can finally tell a provider blip
from a bug. Client aborts are excluded from that signal by design.

### 3.2 The work

**1. Instrumentation — `server/services/_shared/aiMetrics.ts`.** A wrapper around model calls that
records: service, node/chain, model, latency ms, prompt tokens, completion tokens, computed cost, and
outcome (`ok` / `guard_blocked` / `retryable_error` / `fatal_error`). Writes a structured log,
optionally to LangSmith.

Persistence is a separate decision. A Prisma `AiCallMetric` model buys SQL analytics at the price of a
database write per call. **Recommendation: start with structured logs**, and add the model only if
in-app aggregation turns out to be needed. Do not build a metrics store speculatively.

**2. Latency budgets** — written into `spec.md` as non-functional requirements instead of living in
someone's head:

| Flow | p95 target | Rationale |
|---|---|---|
| `aiGuard` L1 | < 5 ms | deterministic, no model call |
| `aiGuard` L2 | < 400 ms | runs before the answer, so it is felt as lag |
| `courseAI` first token | < 1.5 s | SSE — the first token matters, not the whole response |
| `lessonInsightsAI` | < 8 s | background generation |

**3. Prompt reduction — one concrete target the reviewer identified correctly.**
`confidenceScore.ts:33-51` embeds the **entire step-filtered conversation history** in the prompt on
every call, while the same prompt instructs the model to "Base your score PRIMARILY on the EXTRACTED
DATA" and that "A brief conversation is not a reason to score low." The history is supplied and
declared irrelevant in the same breath.

Replace it with a structured summary: the extracted data, a message count, and the user's last turn.
Expect a 60–70% cut in prompt tokens on that node. **Validate against the existing
`evals/datasets/courseAI/confidenceScore.jsonl`** — if quality holds, the change is free.

This is also the answer to "avoid sending full conversation history when structured context is
enough": a specific site, not a general principle.

**4. Strategy comparison** — run the `confidenceScore` eval both ways (full history vs. structured
context) and record score / tokens / latency / cost in a table in the spec. That is "compare quality
and cost between prompt/context strategies," actually carried out.

**5. Monitoring** — LangSmith tracing always on in production. Alerts on: failure rate above 5% over
15 minutes, p95 latency over budget, and a spike in guard blocks (the signal of a targeted attack).

### 3.3 Acceptance criteria

- Every LLM call emits a metric carrying latency, tokens, cost, and outcome.
- Latency budgets are recorded in a spec as NFRs.
- `confidenceScore` prompt tokens drop by ≥ 50% with no drop in eval score.
- The two context strategies are compared in a table in the spec.
- Failure rate and latency are observable without reading raw logs by hand.

---

## 4. Sequencing

```
A (safety) ✅ ──┬──> B (docs) ✅ ──> D (observability) ⬜
                │
                └──> C (process, parallel, any time) ⬜
```

**A first** — it was the only real vulnerability; everything else is quality debt.
**B after A** — the node contracts had to be read anyway while placing the guard, so documenting them
at the same time was the cheap moment.
**D after B** — a failure-rate metric needs B's typed errors; without them every failure is one
generic `CourseAIError`.
**C in parallel** — it depends on nothing.

| Workstream | Tier (ADR-020) | ADR required? |
|---|---|---|
| A — AI safety | **complex** (security model) | ✅ ADR-022 |
| B — Documentation | standard | ❌ |
| C — Process | trivial | ❌ (an edit to ADR-020) |
| D — Observability | standard | ⚠️ only if `AiCallMetric` is added |

---

## 5. Deliberate non-goals

These are decisions, not omissions. ADR-022 and both AI feature specs cite this section rather than
restating it.

- **No LLM guard on every AI flow.** The literal reading of "add prompt injection checks for AI flows"
  — a guard inside each flow — costs **one extra LLM call on every AI path**, driving latency and spend
  up, in direct conflict with workstream D. Instead there is one shared module at the trust boundary,
  layered cheapest-first: L1 deterministic detection (free), L2 topic relevance (~200 ms, free-text
  chat surfaces only), L3 structural isolation (free, and the only layer the database-reading flows
  need). Per-flow guards would buy no coverage L3 does not already provide.
- **No custom metrics dashboard** — LangSmith plus structured logs until that genuinely hurts.
- **No external moderation API** (e.g. OpenAI Moderation). This is a course-authoring platform; toxic
  content is not its profile risk. Revisit if student-to-student UGC appears.
- **No rewrite of the spec process** — ADR-020/021 hold; §2 lists the only three additions needed.
- **No retry logic in nodes and no tool-call timeouts** — metrics (D) first, then it will be visible
  what actually flaps. Choosing a retry policy before measuring is how a bug gets papered over.