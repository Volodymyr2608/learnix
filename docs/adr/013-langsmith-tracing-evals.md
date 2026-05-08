# ADR-013: LangSmith for Tracing and Offline Evals

- **Status**: Accepted
- **Date**: 2026-05

## Context

Once agentic features (ADR-008) are in place, debugging by reading server logs no longer scales:

- An agent turn produces an unbounded number of tool calls and intermediate model calls — flat logs lose the call tree.
- Prompt regressions are silent; a refactor that drops a system instruction passes typecheck and lint and ships.
- Token cost is invisible per request, per feature, and per user.
- The team has no shared way to compare two prompt versions on the same input set.

LangSmith is the canonical observability layer for LangChain-based applications. With a single env var, every `Runnable` (chains from ADR-008, agents, tools, embeddings calls) is auto-traced. It also provides datasets and offline `evaluate()` runs.

## Decision

Adopt LangSmith as the single observability and evaluation system for all AI features.

### Rules

1. **Tracing is opt-in via env vars** declared in `lib/env.js`:
   - `LANGSMITH_API_KEY` — required when tracing is on.
   - `LANGSMITH_PROJECT` — defaults to `learnix-dev` / `learnix-prod`.
   - `LANGSMITH_TRACING` — boolean toggle; defaults to off in dev.
   - `LANGCHAIN_TRACING_V2` — kept as legacy alias for SDK compatibility.

   When `LANGSMITH_TRACING` is unset or `false`, all LangChain code paths run normally with no SDK calls.

2. **All non-LangChain AI code paths use `traceable`.** The SSE handler in `app/api/chat/course/route.ts` and any plain `fetch`-based OpenAI call must be wrapped in `traceable(fn, { name, tags })`.

3. **Per-run tags are mandatory.** Every traced run includes:
   - `feature:<name>` — `tutor`, `insights`, `builder`, `quiz`, `summary`, `search`.
   - `userId:<id>` — for filtering by user during incidents.
   - `model:<id>` — to find runs affected by a model change.
   - `courseId:<id>` (where applicable).

4. **Shared tagging helper.** A single `server/services/_shared/tracing.ts` exports a `traced(name, fn, ctx)` wrapper that derives tags from the calling context. Services do not call `traceable` directly with hand-built tag arrays.

5. **Offline evals live in `evals/`** — outside `server/` and `app/`, runnable with `pnpm eval`. Each AI feature that produces structured output owns at least one dataset (`evals/datasets/<feature>.jsonl`) and one judge configuration.

6. **Datasets are version-controlled JSONL.** Production runs can be exported to LangSmith datasets via the SDK, but the curated golden-set lives in the repo so reviewers see what changed.

7. **Eval runs gate prompt changes.** When a prompt or chain composition changes, `pnpm eval` must be run locally and the score posted in the PR. CI gating is a future addition.

## Consequences

**Positive**
- Adding tracing to the existing `courseAI` and `quizAI` services is a one-line wrap each — observability is retroactive.
- Tag-based filtering in the LangSmith UI maps cleanly to the support workflow ("show me all of user X's tutor runs in the last hour").
- Offline evals catch regressions that schema validation cannot — e.g., a quiz where every option is plausibly correct.
- The `traceable` wrapper covers non-LangChain code, so the trace tree is unbroken across SSE handlers and downstream services.

**Negative / Trade-offs**
- LangSmith is an external SaaS. Sensitive prompt content (course material, student questions) is sent to a third party; this is acceptable for a learning platform but must be documented.
- Adds a paid line item once free-tier quotas are exceeded.
- The `traceable` wrapper adds one stack frame to every traced function — negligible runtime impact but visible in stack traces.
- Datasets in JSONL drift from production reality; periodic refresh from real runs is required.
