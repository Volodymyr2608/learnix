---
feature: ai-course-builder
status: stable
models: [CourseGeneration, CourseGenerationMessage]
depends-on: [course]
---

## Purpose

Instructors find blank-page course creation slow; a guided AI chat that asks the right questions in
order and drafts each step for review gets a publishable course outline faster than a bare form.

## Functional scope

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

## Acceptance criteria

- An instructor can complete all four steps via chat alone and land on a valid, publishable course
  draft without touching a form.
- Saying "yes" / "looks good" / similar only commits the **current** step — it never silently commits
  a revision the instructor was just acknowledging.
- A clarifying question from the model never produces a step-data extraction; only `continue`-intent
  turns that pass `assess_completion` do.
- Refreshing the page mid-conversation resumes from the same step with full message history, no state
  lost.

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
- See ADR-016 for the full graph design and the alternatives considered.