# ADR-008: LangChain Agent + Tools Pattern for AI Features

- **Status**: Accepted
- **Date**: 2026-05

## Context

The AI course builder (ADR-006) was the first AI feature. It uses LangChain as a thin wrapper over the raw OpenAI API:

```ts
// Raw message array, no tools, no agent loop
const stream = await model.stream([
  { role: "system", content: systemPrompt },
  ...history,
  { role: "user", content: userMessage },
]);

// Separate second model call to extract structured data — fragile
const rawJson = JSON.parse(response.content.toString());
const validated = stepValidator.parse(rawJson); // throws on failure, no retry
```

Problems with this approach as more AI features are added:
- Two model calls to produce structured data; if `JSON.parse` fails, the whole operation throws with no recovery.
- Context is stuffed into the system prompt regardless of whether it is needed.
- No guardrails — any user input reaches the model.
- No composable structure — each feature reimplements the same imperative async/await flow.

## Decision

All new AI features are built with three explicit layers:

| Layer | Tool | Purpose |
|---|---|---|
| **Guardrail chain** | LCEL `RunnableSequence` + `withStructuredOutput` | Fast input classifier; short-circuits before the agent if the request is off-topic or injected |
| **Agent** | `createReactAgent` (conversational) or `RunnableSequence` (pipeline) | Reasoning loop; decides which tools to call |
| **Tools** | `tool()` from `@langchain/core/tools` | Typed, named functions the agent calls to fetch data or produce structured output |

Structured output uses `model.withStructuredOutput(zodSchema)` — one call, typed result, no `JSON.parse`. For output that cannot be guaranteed semantically by the schema alone (e.g. `correct` must be one of `options`), a semantic validator runs after generation and re-prompts with the error on failure (up to 3 attempts).

## Rules

1. **Always define a tool.** Any data the agent needs (lesson content, student progress, existing quizzes) is fetched via a named `tool()` with a typed Zod schema — never by pre-loading it into the system prompt.
2. **Use `withStructuredOutput` for deterministic output.** Never call `JSON.parse` on model responses.
3. **Validate semantics after schema validation.** Schema guarantees shape; a semantic validator guarantees meaning (e.g. cross-field constraints).
4. **Gate every conversational feature with a guardrail chain.** The guardrail is a cheap, separate model call that runs before the agent and can abort without touching the agent at all.
5. **Use `ChatPromptTemplate`.** No string interpolation for prompts — variables must be named and typed.
6. **Stream via SSE.** All AI responses are streamed (see ADR-006). For agents, filter tool-call events server-side so only answer tokens reach the client.
7. **Persist state.** Conversation history and intermediate results are stored in the DB so sessions are resumable.
8. **Default model: `gpt-4o-mini`, temperature 0 for classifiers/extractors, 0.3–0.4 for generation.**

## Feature pattern mapping

| Pattern | AI Course Builder | Quiz Generator | Lesson Assistant |
|---|:---:|:---:|:---:|
| Raw `model.stream()` | ✅ legacy | — | — |
| `withStructuredOutput` | — | ✅ | ✅ (guardrail) |
| LCEL `RunnableSequence` | — | ✅ | ✅ (guardrail chain) |
| `ChatPromptTemplate` | — | ✅ | ✅ |
| `tool()` | — | ✅ | ✅ |
| `createReactAgent` | — | ✅ | ✅ |
| Semantic validation + retry | — | ✅ | — |
| Input guardrail chain | — | — | ✅ |

## Consequences

**Positive**
- Each layer (guardrail, agent, tools) is independently testable.
- Adding a new capability to an existing agent means adding a tool — the agent itself does not change.
- Retry logic with error feedback is explicit and bounded (max attempts configured per feature).
- Token cost is lower: tools fetch content on demand instead of always stuffing context.

**Negative / Trade-offs**
- More files per feature compared to a single service class with `model.invoke()`.
- `createReactAgent` from `@langchain/langgraph` adds a LangGraph dependency; the agent loop is less transparent than an explicit chain.
- The course builder (ADR-006) does not yet use this pattern — it can be refactored incrementally once the new pattern is proven.
