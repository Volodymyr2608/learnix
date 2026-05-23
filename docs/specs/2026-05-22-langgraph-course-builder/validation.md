# LangGraph Course Builder — Validation

## Automated checks

- `pnpm typecheck` — clean.
- `pnpm check` — clean (Biome lint + format).
- `pnpm build` — succeeds.
- LangSmith eval thresholds (gates for merge, run from `evals/courseAI/`):
  - `classifyIntent.eval.ts` accuracy ≥ 0.85.
  - `assessCompletion.eval.ts` precision on `ready: true` ≥ 0.9.
  - `extractStepData.eval.ts` Zod-pass-rate + key-field-match ≥ 0.9.
  - `confidenceScore.eval.ts` calibration: of predictions where `score ≥ 0.8`, actual-complete rate ≥ 0.85.

## Manual test scenarios

Run `pnpm dev` and exercise the AI Builder dialog at `/instructor/courses/new` (or wherever the builder is mounted).

### Scenario 1 — Happy-path full course creation

1. Open the AI Builder. Send: "I want to teach intermediate Python for data scientists, 6 hours, in English."
2. Expect a `tool_call` indicator (likely `lookup_category_taxonomy` and/or `search_similar_courses`).
3. Expect chat tokens stream normally.
4. Click "Accept Step".
5. Expect `confidence` event with a value, `step_committed` with `autoAdvanced: false` (first step, the agent may or may not auto-advance; document either).
6. Repeat through `objectives`, `requirements`, `curriculum`.
7. At `curriculum`, expect `validate_curriculum_coherence` tool call (visible in the indicator).
8. Final state: `CourseGeneration.content` contains all four step payloads matching the Zod schemas.

### Scenario 2 — Auto-advance (no Accept click)

1. Provide an unusually complete first message: "Title: Mastering React 19. Subtitle: Build production apps with the new compiler. Description: 500-word professional description. Category: Web Development. Level: Intermediate. Language: English. Duration: 8 hours."
2. **Do not click Accept.** Wait for the model's streamed response to finish.
3. Expect (in this order, post-stream): no immediate `done`, then `confidence` event with value ≥ 0.8, then `step_committed` with `autoAdvanced: true`, then `done`.
4. The UI should display an "Auto-advanced" pill where the Accept button used to be, and the step indicator should advance to `objectives` automatically.
5. LangSmith trace should show `assess_completion: ready=true` and `confidence_score >= 0.8`.

### Scenario 2b — Mid-confidence, no auto-advance

1. Send a partially complete first message that the agent considers ready to extract but not confidently complete (e.g., "I want to teach Python. Maybe intermediate. ~5 hours.").
2. Wait for stream to finish.
3. Expect `confidence` event with value `< 0.8`, then `done`. **No `step_committed` event.** Step does not advance. Accept button remains visible.
4. Click Accept.
5. Now expect a finalize-mode round trip: `start → confidence → step_committed (autoAdvanced: false) → done`.

### Scenario 3 — Validation failure routes to clarify

1. On the `objectives` step, send: "just one objective: learn stuff".
2. Click "Accept Step".
3. Expect the assistant to stream a clarifying follow-up (objectives requires at least 4). No `step_committed` event. Step does not advance in DB.

### Scenario 4 — Revision

1. Drive a course up to `requirements` step.
2. Send: "actually change the level to Advanced".
3. Expect `intent: "revise"` (visible via LangSmith trace).
4. Expect a short streamed confirmation ("Updated level to Advanced…").
5. Verify `CourseGeneration.content.basic.level === "Advanced"`. Verify `currentStep` is still `requirements`. Verify the `objectives` payload is untouched.

### Scenario 5 — Tool failure fallback

1. Temporarily break `embeddingsService.embedQuery` (throw in dev).
2. Send a message that would invoke `search_similar_courses`.
3. Expect the chat still streams a response (without similar-course context). No SSE `error` event. Log shows `CourseAIToolError`.
4. Restore `embeddingsService`.

### Scenario 6 — Abort mid-stream

1. Send a long-form prompt.
2. While tokens are streaming, click the cancel/close button in the UI (or fire `AbortController.abort()` from devtools).
3. Expect no further token events, no assistant message persisted in `CourseGenerationMessage`, no DB write to `CourseGeneration`.

### Scenario 7 — Tracing visible in LangSmith

1. Run any of the above with `LANGSMITH_TRACING=true`.
2. Open LangSmith → the project from ADR-013 → confirm one run per turn with per-node spans (`classify_intent`, `tool_router`, `tool_node`, `chat_response`, etc.).
3. Confirm tool invocations show inputs and outputs in the span tree.

## Regression checks

- Existing AI services (`lessonAssistant`, `quizAI`, `learningPathAI`, `lessonInsightsAI`) are untouched — open one of each in the UI and confirm it still works.
- Existing semantic search (`/dashboard/browse?q=…`) still works (shared `EmbeddingsService` is reused by `search_similar_courses` but the search router is unchanged).
- Existing course CRUD and publish flow unaffected by builder changes.

## Performance baseline

Measure end-to-end token-to-screen latency on a chat-mode turn before and after the rewrite, using a fixed prompt. The new path adds one `classify_intent` structured-output call before streaming begins; the additional latency budget is **≤ 400 ms** on `gpt-4o-mini`. If the budget is exceeded, consider:

- Making `classify_intent` skip when `history` is empty (first turn is always `continue`).
- Using a smaller model (`gpt-4o-mini` already; could try `gpt-3.5-turbo` for this node only).
- Running `classify_intent` in parallel with the start of `tool_router` and reconciling.
- Note: `assess_completion` and the rest of the post-stream pipeline contribute **post-streaming** latency only (user already sees the response); they don't affect pre-stream perceived latency.

These are post-merge optimizations; not gating.