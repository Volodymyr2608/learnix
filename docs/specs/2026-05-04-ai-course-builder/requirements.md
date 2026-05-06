# Requirements: AI Course Builder

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

## AI model

- Provider: OpenAI via LangChain `ChatOpenAI`.
- Model: `gpt-4o-mini`.
- Temperature: `0.4` for chat, `0` for JSON extraction.
- Context window: last 4 messages only (to keep token usage bounded).

## Access control

- The SSE endpoint requires a valid session (`getSession()`); returns `401` otherwise.
- `courseAI.*` tRPC procedures use `instructorProcedure` — only `INSTRUCTOR` role users can use the builder.
