# LangGraph Course Builder — Implementation Plan

Order is chosen so each step is independently verifiable and the existing builder remains green until step 8.

## Step 1 — Install dependencies & scaffold state

- Add `@langchain/langgraph` to `package.json`.
- Create `lib/constants/courseCategories.ts` with the canonical category list. Replace category enum strings already referenced in prompts with imports from this file (single source of truth).
- Create `server/services/courseAI/graph/state.ts` using the modern Zod-schema approach (`@langchain/langgraph/zod` adds `.langgraph.reducer(...)` and `.langgraph.metadata(...)` extensions to Zod):
  ```ts
  import "@langchain/langgraph/zod";
  import { z } from "zod";
  import { DraftStep } from "@/generated/prisma";

  const draftStep = z.nativeEnum(DraftStep);

  const historyEntry = z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
    step: draftStep,
  });

  export const CourseBuilderState = z.object({
    // hydrated at request start
    generationId:  z.string(),
    instructorId:  z.string(),
    currentStep:   draftStep,
    content:       z.record(z.string(), z.unknown()).default(() => ({})),
    history:       z.array(historyEntry).default(() => []),
    mode:          z.enum(["chat", "finalize"]),

    // current turn — set by route handler
    userMessage:   z.string().default(""),

    // produced by nodes
    intent:        z.enum(["continue", "revise"]).nullable().default(null),
    reviseTarget:  draftStep.nullable().default(null),
    toolCalls:     z
      .array(z.unknown())
      .default(() => [])
      .langgraph.reducer(
        (prev, next) => prev.concat(Array.isArray(next) ? next : [next]),
        z.union([z.unknown(), z.array(z.unknown())]),
      ),
    assessReady:        z.boolean().default(false),
    draftStepData:      z.unknown().default(undefined),
    confidence:         z.number().min(0).max(1).default(0),
    shouldAutoAdvance:  z.boolean().default(false),
    assistantText:      z
      .string()
      .default("")
      .langgraph.reducer((prev, next) => prev + next, z.string()),
    validationErrors:   z.array(z.unknown()).nullable().default(null),
  });

  export type CourseBuilderStateT = z.infer<typeof CourseBuilderState>;
  ```
  Notes on the schema:
  - The `import "@langchain/langgraph/zod"` side-effect import installs `.langgraph.reducer(...)` on Zod schema instances; required at the top of any file that uses it.
  - Reducers replace the Annotation-API `reducer` option. Default values replace `default: () => …`.
  - `StateGraph` accepts the Zod schema directly: `new StateGraph(CourseBuilderState)` (no `.Annotation.Root` wrapper).
  - Per-turn fields (`userMessage`, `intent`, `assessReady`, `draftStepData`, `confidence`, `shouldAutoAdvance`, `assistantText`, `validationErrors`) reset on each graph invocation because the route handler builds a fresh initial-state object for every HTTP request — no LangGraph checkpointer in play.
- Verify: `pnpm typecheck` passes.

## Step 2 — Implement the four tools

Each tool exports a `tool({ name, description, schema, func })` from `@langchain/core/tools`. Schemas are Zod.

- `tools/searchSimilarCourses.ts` — wraps `embeddingsService.embedQuery` + `embeddingRepository.findSimilarCourses`. Args: `{ query, limit? }`. Returns trimmed `{ title, subtitle, sectionCount }[]`.
- `tools/fetchInstructorPriorCourses.ts` — factory `makeFetchInstructorPriorCourses(instructorId)` that closes over the instructor id so the model doesn't pass it. Returns `{ id, title, level, category, language }[]`.
- `tools/validateCurriculumCoherence.ts` — sub-LLM call (`gpt-4o-mini`, temp 0, structured output `{ passes, issues }`). Args: `{ sections, level, objectives }`.
- `tools/lookupCategoryTaxonomy.ts` — reads `lib/constants/courseCategories.ts`. No args. Returns `string[]`.
- Each tool's `func` wraps its body in try/catch. On error: log via `logger.error(new CourseAIToolError(...))` and **return** `JSON.stringify({ error: "tool failed; proceed without this information" })` instead of throwing. This way `ToolNode` produces a normal tool message, the LLM sees the failure in the message thread, and the graph continues into `chat_response` without aborting. `CourseAIToolError` is added to `courseAI.errors.ts` purely for typed logging.
- Verify: write a one-off `tsx` script under `evals/courseAI/_smoke/tools.ts` that imports each tool and runs it against a seeded test course. Manual run only, not committed long-term.

## Step 3 — Implement leaf nodes (no graph wiring yet)

Implement each as `async (state) => Partial<state>`. No reducer logic in node bodies; pure state transitions.

- `nodes/classifyIntent.ts` — `gpt-4o-mini` with `.withStructuredOutput({ intent, reviseTarget?, reason })`, temp 0. Inputs: `userMessage`, `history`, `currentStep`. Defaults to `{ intent: "continue" }` on parse failure.
- `nodes/revisePriorField.ts` — structured output schema = `getValidatorForStep(reviseTarget).partial()`. Writes `content[reviseTarget]` (merged), streams a one-line confirmation via `model.stream()`.
- `nodes/toolRouter.ts` — `model.bindTools([…all four tools…])`. Returns AIMessage with tool calls; the graph wires `tool_node` after it.
- `nodes/chatResponse.ts` — `model.stream()` using existing `buildSystemPrompt` + history + tool messages. **This replaces today's `streamChatResponse`.**
- `nodes/assessCompletion.ts` — `gpt-4o-mini`, temp 0, structured output `{ ready: boolean, reason: string }`. Cheap call (~200 ms). Only runs in chat mode after `chat_response`. Decides whether to auto-trigger the finalize pipeline.
- `nodes/extractStepData.ts` — `model.withStructuredOutput(getValidatorForStep(currentStep))`. Reuses existing `extractStepDataPrompt`.
- `nodes/validate.ts` — pure function. Re-runs the Zod schema (defensive; structured output already conforms) and adds cross-field checks for the curriculum step (e.g., at least one lesson per section).
- `nodes/confidenceScore.ts` — structured output `{ score: number, rationale: string }`. Pure-code threshold: `shouldAutoAdvance = score >= 0.8 && validationErrors === null`.
- `nodes/clarify.ts` — `model.stream()` with a prompt that includes `validationErrors` and asks a follow-up.
- `nodes/persistAndEmit.ts` — calls `courseGenerationRepository.transaction(...)` matching today's `acceptStep`. Returns nothing extra to state; emission happens via LangGraph events the route handler subscribes to.
- `graph/withNodeErrors.ts` — small wrapper: `withNodeErrors(name, fn)` logs and throws `CourseAIError(name)`.

Verify: each node compiles in isolation. No graph wiring yet.

## Step 4 — Wire the graph

`graph/graph.ts`:

```ts
const builder = new StateGraph(CourseBuilderState)
  .addNode("classify_intent",     classifyIntent)
  .addNode("revise_prior_field",  revisePriorField)
  .addNode("tool_router",         toolRouter)
  .addNode("tool_node",           new ToolNode([...tools]))
  .addNode("chat_response",       chatResponse)
  .addNode("assess_completion",   assessCompletion)
  .addNode("extract_step_data",   extractStepData)
  .addNode("validate",            validate)
  .addNode("confidence_score",    confidenceScore)
  .addNode("clarify",             clarify)
  .addNode("persist_and_emit",    persistAndEmit)
  // entry routing: chat mode runs classify_intent; finalize mode skips straight to extract
  .addConditionalEdges(START, routeByMode, {
    chat:     "classify_intent",
    finalize: "extract_step_data",
  })
  .addConditionalEdges("classify_intent", routeByIntent, {
    revise:   "revise_prior_field",
    continue: "tool_router",
  })
  .addConditionalEdges("tool_router", routeAfterToolRouter, {
    use_tool: "tool_node",
    answer:   "chat_response",
  })
  .addEdge("tool_node", "tool_router")             // loop until no tool calls
  .addEdge("chat_response",      "assess_completion")
  .addEdge("revise_prior_field", "assess_completion")
  .addConditionalEdges("assess_completion", routeAfterAssess, {
    not_ready: END,
    ready:     "extract_step_data",
  })
  .addEdge("extract_step_data", "validate")
  .addConditionalEdges("validate", routeAfterValidate, {
    pass: "confidence_score",
    fail: "clarify",
  })
  .addConditionalEdges("confidence_score", routeAfterConfidence, {
    // chat mode: only persist if shouldAutoAdvance (confidence >= 0.8); otherwise wait for explicit Accept
    persist:    "persist_and_emit",
    hold:       END,
  })
  .addEdge("clarify",          END)
  .addEdge("persist_and_emit", END);

export const courseBuilderGraph = builder.compile();
```

Route predicates (all tiny pure functions over state):

- `routeByMode(s)` → `s.mode === "finalize" ? "finalize" : "chat"`.
- `routeByIntent(s)` → `s.intent === "revise" ? "revise" : "continue"`.
- `routeAfterToolRouter(s)` → presence of unresolved tool calls.
- `routeAfterAssess(s)` → `s.assessReady ? "ready" : "not_ready"`.
- `routeAfterValidate(s)` → `s.validationErrors === null ? "pass" : "fail"`.
- `routeAfterConfidence(s)` → `s.mode === "finalize" || s.shouldAutoAdvance ? "persist" : "hold"`. In finalize mode, always persist (user explicitly asked). In chat mode, only persist when confidence ≥ 0.8.

Verify: `pnpm typecheck` passes. The graph can be invoked with a stub state in a one-off `tsx` script with `mode: "chat"` and produce a streamed AI message.

## Step 5 — Rewrite `courseAI.service.ts`

Thin entry point. No business logic in this file.

```ts
export class CourseAIService {
  async getOrCreateCourseGeneration(...) { /* unchanged */ }
  async saveMessage(...)                  { /* unchanged */ }

  async *runChat({ courseGeneration, userMessage, signal })  { /* graph.streamEvents with mode="chat"; may auto-persist */ }
  async   runFinalize({ courseGeneration, signal })          { /* graph.invoke with mode="finalize"; always persists on validation pass */ }
}
```

- Hydrate `CourseBuilderState` from `CourseGeneration` + last 4 `CourseGenerationMessage`s (reusing today's `getLastMessages`).
- Wrap the graph invocation with `traced("courseAI.graph", …, { feature: "builder", userId, model })`.
- Remove the `traced(...)` wrapper currently around `extractStepData` — subsumed.

Verify: `pnpm typecheck`. The old public methods `streamChatResponse`, `extractStepData`, and `acceptStep` are removed; the route handler and tRPC router will be updated in the next step.

## Step 6 — Update the route handler

`app/api/chat/course/route.ts`:

- Switch from `for await (const chunk of streamChatResponse(...))` to `graph.streamEvents(initialState, { version: "v2", signal })`.
- Map LangGraph events to SSE shape:
  - `on_chat_model_stream` → `{ type: "token", value }`
  - `on_tool_start` → `{ type: "tool_call", name, args }`
  - Graph final state from `persist_and_emit` (only on a separate finalize POST) → `{ type: "confidence", value }` and `{ type: "step_committed", … }`
- Existing abort / save-assistant-message flow is preserved (assistant text is still accumulated from token events for `saveMessage` on completion).

Update the existing tRPC `acceptStep` mutation in `server/api/routers/ai.ts` to call `runFinalize` and return `{ step, autoAdvanced, confidence }`.

Verify: hit the route end-to-end with `curl` against the local dev server (`pnpm dev`); confirm `start → token* → done` for chat mode and `start → token* → confidence → step_committed → done` for finalize mode.

## Step 7 — UI updates

`app/_components/Course/components/AIChatBuilderDialog/`:

- Add a `ToolCallIndicator` component that renders inline when a `tool_call` event arrives and fades out when the next `token` arrives. Map tool name → human label ("Searching similar courses…").
- Add a `ConfidenceBadge` component that renders next to the step indicator after a `confidence` event. Format: "AI is N% confident".
- On `step_committed`, if `autoAdvanced: true`, hide the "Accept Step" button and show a "Auto-advanced" pill instead.
- Existing event handling for `start`, `token`, `error`, `done` is unchanged.

Verify: open the AI Builder dialog in dev, drive a course through all four steps, confirm tool indicators appear when the agent uses tools, confidence badge appears after each step finalize, auto-advance hides the Accept button on confident steps.

## Step 8 — LangSmith evals

`evals/courseAI/`:

- `classifyIntent.eval.ts` — 20 labeled examples covering `continue`, `revise basic`, `revise objectives`, `revise requirements`, `revise curriculum`, ambiguous. Metric: exact match on `intent` + `reviseTarget`. Target accuracy ≥ 0.85.
- `assessCompletion.eval.ts` — 20 labeled examples (10 complete-enough conversations, 10 still-needs-more-info). Metric: precision on `ready: true` ≥ 0.9 (false positives are costly — they trigger premature auto-persist). Recall is secondary.
- `extractStepData.eval.ts` — 10 examples per step (40 total). Metric: Zod validation passes + key-field match (title for basic, objective count ≥ 4, etc.). Target ≥ 0.9.
- `confidenceScore.eval.ts` — 20 labeled examples mixing "complete" and "incomplete" step states. Metric: AUC on confidence vs. label, plus calibration check (predicted ≥ 0.8 should be ≥ 0.85 actually-complete).
- Wire these into the existing eval runner pattern from ADR-013.

Verify: `pnpm tsx evals/courseAI/classifyIntent.eval.ts` (or however the existing eval CLI invokes it) produces a LangSmith run and meets targets.

## Step 9 — Cleanup

- Delete the now-unused `streamChatResponse` and `extractStepData` method bodies from history (already removed in step 5, this is a final sweep for dead imports).
- Update CLAUDE.md's "AI course builder" section to reference the graph topology and the four tools.
- Add ADR-016 (`docs/adr/016-langgraph-course-builder.md`) capturing the decision: why LangGraph here, why single StateGraph over supervisor+subgraphs, why no checkpointer, why 0.8 confidence threshold, why `assess_completion` gates auto-persist.

Verify: `pnpm check` and `pnpm typecheck` both clean. `pnpm build` succeeds.

## Rollout

No flag, no canary. The cutover happens in step 5 once `courseAI.service.ts` is rewritten and routes/UI are updated in 6 and 7. Tests are not gating (none exist); LangSmith eval thresholds in step 8 are the gate for merging.