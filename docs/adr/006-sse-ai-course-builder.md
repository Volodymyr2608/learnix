# ADR-006: SSE Streaming for AI Course Builder

- **Status**: Accepted
- **Date**: 2026-01

## Context

Instructors need an AI-assisted, conversational course builder. The AI response must stream token-by-token to feel responsive. tRPC does not natively support server-sent events (SSE) with the streaming semantics we needed.

## Decision

Implement the AI chat endpoint as a plain Next.js Route Handler (`app/api/chat/course/route.ts`) using **Server-Sent Events** over a `ReadableStream`. Use LangChain's `ChatOpenAI` with `gpt-4o-mini` on the server.

The stream emits typed JSON events:
- `{ type: "start", courseGenerationId }` — signals the generation session ID
- `{ type: "token", value }` — a streamed text chunk
- `{ type: "actions", currentStep }` — signals the AI finished and the client can show "accept" controls
- `{ type: "done" }` — assistant message has been persisted
- `{ type: "error", message }` — recoverable stream error

The client (`useChatStreaming.ts`) reads the stream via `fetch` + `ReadableStream` and dispatches each event to local state.

## Consequences

**Positive**
- True token-by-token streaming; the user sees text appear as the model generates it.
- Abort signal is threaded from the HTTP request through to the LangChain stream, so cancelling the fetch also stops OpenAI generation.
- The generation session (`CourseGeneration`) and all messages (`CourseGenerationMessage`) are persisted in Postgres, allowing the instructor to resume a draft.

**Negative / Trade-offs**
- The SSE route is outside tRPC, so it needs its own auth check (`getSession()` from `server/better-auth/server.ts`) and its own error handling.
- `OPENAI_API_KEY` is consumed directly by `CourseAIService` and is not declared in the `@t3-oss/env-nextjs` schema — it must be added manually to `.env`.
- The route is forced to `runtime = "nodejs"` (not edge) because LangChain requires Node.js APIs.
