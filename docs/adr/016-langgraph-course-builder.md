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
| `continue` | User is approving, moving forward, asking a question, or providing information for the current step | `tool_router → chat_response` |
| `revise` | User explicitly wants to add, remove, or change stored content — in the current step or an earlier one | `revise_prior_field` |
| `clarify` | Message is genuinely ambiguous between moving forward and requesting a content change | `chat_response` (clarify-question branch, no tools) |

When `intent = clarify`, `chat_response` generates one focused question to resolve the ambiguity. `assess_completion` returns `not_ready` for clarify turns so the turn never triggers extraction.

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

`assess_completion` uses a structured-output LLM call returning one of three decisions: `ready` (user wants to proceed), `not_ready` (user wants a change or asks a question), or `ask` (intent is genuinely ambiguous). When `ask` is returned the node populates `state.assessClarify` with a clarifying question and the graph routes to the `clarify` node, which streams it to the user. `revise` and `clarify` turns return `not_ready` immediately without an LLM call, so they never trigger extraction.

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

## Implementation refinements

The following design decisions were made during implementation to address issues not anticipated in the original spec.

### Two-schema extraction pattern

`withStructuredOutput` with Zod schemas containing `.min(n)` or `.max(n)` constraints generates JSON Schema `minItems`/`maxItems` properties that `gpt-4o-mini` occasionally echoes as literal output fields, crashing before `validate.ts` can handle them gracefully. To prevent this, extraction uses a separate relaxed schema (`server/services/courseAI/validators/getExtractionSchemaForStep.ts`) with no min/max constraints passed to `withStructuredOutput`. Full validation (including minimum-count checks and cross-field rules) still runs in `validate.ts` using the original `getValidatorForStep` schema. This applies to both `extractStepData` and `revisePriorField`.

### Message persistence order

User messages are saved to `CourseGenerationMessage` **after** the graph completes (in the route's `finally` block), not before. Saving before the graph caused `hydrateState` to load the current user message into `state.history`, creating duplication in every node that builds conversation context by appending `state.userMessage` explicitly (e.g. `toolRouter`, `chatResponse`, `assessCompletion`, `confidenceScore`). With the corrected order, `state.history` contains only prior turns and `state.userMessage` is the sole reference to the current turn.

### `assess_completion` three-decision model

`assessCompletion` uses a pure LLM approach with no hardcoded word lists. The model returns one of three decisions: `ready`, `not_ready`, or `ask`. The `ask` path generates a clarifying question in `state.assessClarify` and routes to the `clarify` node instead of ending the turn silently. This handles informal phrasing ("so i like it", "lets moeve on") and typos correctly without requiring an exhaustive word list, at the cost of one extra LLM call per turn.

### `classify_intent` auto-trigger bypass

When `state.userMessage` is empty (auto-trigger fired by the frontend after a step commit), `classifyIntent` immediately returns `intent: "continue"` without making an LLM call. An empty message can only be a trigger to start the next step's introduction, never a revision or clarification request.

### Step-scoped history in `confidence_score`

The history passed to the confidence model is filtered to messages where `step === state.currentStep`. Without this filter, revision confirmations and responses from earlier steps bleed into the confidence prompt and can suppress the score below the 0.8 auto-advance threshold even when the current step's data is complete.

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