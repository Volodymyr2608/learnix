# ADR-016: LangGraph-Based AI Course Builder

- **Status**: Accepted
- **Date**: 2026-05

## Context

The previous AI course builder (ADR-006, ADR-008) used a flat LCEL `RunnableSequence` with a hand-rolled SSE loop. As the step count grew the single-chain approach became fragile: adding routing logic, confidence scoring, or revision paths required modifying the main sequence rather than composing new nodes. There was also no clean way to conditionally auto-advance vs. prompt the user for confirmation.

## Decision

Replace the LCEL chain with a **LangGraph `StateGraph`** compiled to `courseBuilderGraph`. The graph is defined in `server/services/courseAI/graph/` and wired in `server/services/courseAI/courseAI.service.ts`.

### Graph topology

```
classify_intent
  ├─► (intent=continue)  tool_router ──► ToolNode ──► tool_router (loop)
  │                           └─► chat_response ──► assess_completion
  │                                                       ├─► (ready) extract_step_data ──► validate
  │                                                       │                                    ├─► (pass) confidence_score ──► persist_and_emit
  │                                                       │                                    └─► (fail) clarify
  │                                                       └─► (not ready) END
  ├─► (intent=revise)    revise_prior_field ──► chat_response ──► assess_completion (→ not ready → END)
  ├─► (intent=clarify)   chat_response (clarify-question branch, bypasses tools)
  └─► (finalize mode)    extract_step_data ──► validate ──► confidence_score ──► persist_and_emit
```

Entry node for `chat` mode: `classify_intent`. Entry node for `finalize` mode: `extract_step_data`.

### Intent classification

`classify_intent` uses a structured-output LLM call to classify every chat-mode turn into one of three intents:

| Intent | Meaning | Route |
|---|---|---|
| `continue` | User is moving forward with the current step | `tool_router → chat_response` |
| `revise` | User wants to update a field from an earlier step | `revise_prior_field` |
| `clarify` | Message is genuinely ambiguous between continue and revise | `chat_response` (clarify-question branch, no tools) |

When `intent = clarify`, `chat_response` generates one focused question to resolve the ambiguity (e.g. "Did you mean to update the level from the Basic Info step, or are you adding detail for the current objectives step?"). `assess_completion` returns `ready: false` for clarify turns so the turn never triggers extraction.

### State

`CourseBuilderState` is a Zod schema (`server/services/courseAI/graph/state.ts`) passed through the graph. Two fields use LangGraph reducers:

- **`toolCalls`** — accumulates across nodes (append reducer)
- **`assistantText`** — accumulates streamed tokens (concat reducer)

**`pendingToolCalls`** has no reducer (overwritten each pass) and is used only for routing within a single `tool_router` iteration, avoiding false positives from the accumulated `toolCalls` list.

### No checkpointer — follows ADR-003

State is not persisted by LangGraph's `PostgresSaver` or any other checkpointer. Instead, state is **hydrated at the start of each request** from the existing `CourseGeneration` and `CourseGenerationMessage` tables via `courseGenerationRepository` and `courseGenerationMessageRepository`.

This follows ADR-003 (repository pattern): services orchestrate repositories and do not bypass them. Introducing a separate LangGraph checkpoint store would create a dual source of truth and violate the single-model-per-repository rule.

### Two run modes

`CourseAIService` exposes two entry points:

- **`runChat`** — entry at `classify_intent`; saves an assistant message after the stream ends; only persists step data when the `persist_and_emit` node fires (auto-advance at confidence ≥ 0.8, or explicit `finalize` call from the client)
- **`runFinalize`** — entry at `extract_step_data`; always flows through to `persist_and_emit`

### Auto-advance threshold

`confidence_score` emits a `confidence` SSE event. If the score is ≥ 0.8 the graph automatically routes to `persist_and_emit` without waiting for user confirmation. Below 0.8 the stream ends with a `done` event and the UI shows an "Accept" button.

### Tools

Four tools are registered on the LLM via `tool_router`:

| Tool | Purpose |
|---|---|
| `search_similar_courses` | Semantic search for published courses |
| `fetch_instructor_prior_courses` | Reads instructor's own past courses (instructor ID sourced from `RunnableConfig.configurable`, not LLM input) |
| `validate_curriculum_coherence` | Checks curriculum section/lesson structure |
| `lookup_category_taxonomy` | Returns valid category and subcategory values |

### Revision persistence

`revise_prior_field` persists the updated content directly to `CourseGeneration.content` using `courseGenerationRepository.update()`. Content is stored as a **flat merged object** (all step fields at the top level). The node emits a `content_revised` SSE event so the preview panel refetches without waiting for a step commit.

### Node progress events

`on_chain_start` for informative nodes emits a `node_start` SSE event so the UI can display in-progress indicators. The six informative nodes are: `classify_intent`, `assess_completion`, `extract_step_data`, `validate`, `confidence_score`, `revise_prior_field`.

`ToolCallIndicator` labels both tool names and node names, cleared on the first `token` event.

### Confirmation-gated extraction

`assess_completion` requires **explicit user confirmation** ("ok", "yes", "looks good", etc.) before returning `ready: true`. It distinguishes confirmation of the current step's content from acknowledgment of a revision to an earlier step (e.g., "alright" after "Updated the duration to 30 hours" is NOT treated as step confirmation).

### SSE event mapping

| LangGraph event | SSE type |
|---|---|
| `on_chat_model_stream` (nodes: `chat_response`, `clarify`) | `token` |
| `on_tool_start` | `tool_call` |
| `on_chain_start` (informative nodes) | `node_start` |
| `on_chain_end` (node = `revise_prior_field`) | `content_revised` |
| `on_chain_end` (node = `confidence_score`) | `confidence` |
| `on_chain_end` (node = `persist_and_emit`) | `step_committed` |
| stream end | `done` |

### Frontend component extension — follows ADR-011

`AIChatBuilderDialog` (the ADR-011 reference implementation) was extended with two new sub-components co-located under `components/Chat/` following the component folder architecture:

- `ToolCallIndicator` — shows a spinner with a human-readable label while a tool is running
- `ConfidenceBadge` — renders a badge with the AI confidence percentage

No new top-level component folders were created; both sub-components slot into the existing `Chat/` folder per ADR-011 rules.

## Consequences

**Positive:**
- Each graph node is isolated and independently testable
- LangSmith traces the entire graph execution automatically via `traced()` wrapper
- Revision path is a first-class graph edge, not a special-case branch in a chain
- Auto-advance reduces friction for high-confidence steps

**Negative:**
- `classify_intent` LLM call adds latency before every chat-mode turn
- `classify_intent` adds a third `"clarify"` path that asks a question instead of responding, which adds one extra turn when intent is ambiguous
- No mid-session state persistence means a server restart between turns re-hydrates from the message history limit (`HISTORY_LIMIT = 4`)

## References

- ADR-003: Repository Pattern for Data Access
- ADR-006: SSE AI Course Builder
- ADR-008: LangChain Agent Pattern
- ADR-011: Component Folder Architecture
- ADR-013: LangSmith Tracing and Evals