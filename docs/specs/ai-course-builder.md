# Spec: AI Course Builder

## Overview

Instructors can generate a course draft through a guided AI chat instead of filling the form manually. The AI collects course data step by step through conversation. Each completed step populates a live preview panel. When all steps are done, the instructor can import the draft into the course form.

## Steps

Steps are defined in `DraftStep` (Prisma enum) and the `STEPS` constant in the frontend:

| Step | `DraftStep` value | What the AI collects |
|------|-------------------|----------------------|
| 1 | `basic` | Title, subtitle, description, category, level, language, duration, price |
| 2 | `objectives` | Learning objectives (≥ 4) |
| 3 | `requirements` | Prerequisites / requirements (≥ 2) |
| 4 | `curriculum` | Sections and lessons |

## Data persistence

```
CourseGeneration
  ├── id
  ├── instructorId
  ├── step: DraftStep       (current active step)
  ├── content: Json         (accumulated step data)
  ├── status: active | completed | abandoned
  └── messages[]
        ├── role: user | assistant | system
        ├── content: String
        └── step: DraftStep (step active when the message was sent)
```

## SSE streaming protocol

Endpoint: `POST /api/chat/course`

Request body:
```json
{ "courseGenerationId": "...", "userMessage": "..." }
```

Response: `text/event-stream`, each line: `data: <json>\n\n`

| Event type | Payload | Meaning |
|------------|---------|---------|
| `start` | `{ courseGenerationId }` | Session ID confirmed / created |
| `token` | `{ value }` | One streamed text chunk from the model |
| `actions` | `{ currentStep }` | AI finished; show "Accept" button |
| `done` | — | Assistant message saved to DB |
| `error` | `{ message }` | Non-abort error; show to user |

## Step lifecycle

### Streaming a message

1. Client sends user message to `POST /api/chat/course`.
2. Server calls `CourseAIService.getOrCreateCourseGeneration` to get or create the `CourseGeneration` row.
3. User message is saved (`CourseGenerationMessage`).
4. `CourseAIService.streamChatResponse` builds a system prompt for the current step and streams tokens via LangChain.
5. On stream completion the assistant message is saved and a `done` event is emitted.

### Accepting a step

1. Client calls `api.courseAI.acceptStep.mutate({ courseGenerationId })`.
2. `CourseAIService.extractStepData` calls the model again with the last 4 messages and a structured extraction prompt, forcing JSON output.
3. The extracted data is validated with a step-specific Zod schema.
4. A transaction updates `CourseGeneration.content` (merging the new step data) and advances `step` to the next value.
5. An assistant message with the next step's prompt text is saved.
6. The client advances the `currentStep` index, and the preview panel renders the newly extracted data.

### Resuming a session

- `api.courseAI.getActiveCourseGeneration` returns the most recent `active` generation for the instructor, including up to 50 messages.
- The client replays the message history and restores `currentStep` and `completedSteps` from the generation state.

## Frontend components

```
AIChatBuilderDialog/
├── ChatPanel            Chat input + message list + step progress header
│   ├── ChatHeader       ProgressSteps indicator (visual step tracker)
│   ├── ChatMessages     Message bubbles with typing simulation
│   └── ChatInput        Text input + send button
└── PreviewPanel         Live preview of accumulated course data
    ├── BasicInfoCard
    ├── ObjectivesCard
    ├── RequirementsCard
    └── CurriculumCard
```

Key hooks:
- `useChatStreaming` — manages the `fetch` + `ReadableStream` connection, dispatches events.
- `useChatActions` — orchestrates send, accept, and cancel actions.
- `useChatState` — local message list and step state.
- `useCourseStepFlow` — calls `acceptStep` mutation and advances step UI.
- `useTypingSimulation` — animates assistant messages character by character.
- `useCourseGenerationStatus` — polls the generation state on resume.

## AI model

- Provider: OpenAI via LangChain `ChatOpenAI`.
- Model: `gpt-4o-mini`.
- Temperature: `0.4` for chat, `0` for JSON extraction.
- Context window: last 4 messages only (to keep token usage bounded).

## Access control

- The SSE endpoint requires a valid session (`getSession()`); returns `401` otherwise.
- `courseAI.*` tRPC procedures use `instructorProcedure` — only `INSTRUCTOR` role users can use the builder.
