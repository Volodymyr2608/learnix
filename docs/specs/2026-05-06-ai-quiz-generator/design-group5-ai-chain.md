# Design: Group 5 — AI Quiz Generation (Service Layer)

## Overview

A LangChain ReAct agent reads lesson content and existing quiz questions via two
read-only tools, then produces 3–5 structured multiple-choice questions through
`gpt-4o-mini` with `withStructuredOutput`. Orchestration runs inside a
`RunnableSequence`; a bounded retry loop (max 3) feeds validation errors back as
hints so the agent can self-correct.

---

## File Structure

```
server/services/quizAI/
├── schemas/
│   └── quizOutput.schema.ts        # Zod output schemas
├── tools/
│   ├── getLessonContent.tool.ts    # tool: reads Lesson.title + Lesson.content
│   └── getExistingQuizzes.tool.ts  # tool: reads existing Quiz rows
├── quizAI.agent.ts                 # createQuizAgent() factory
├── quizAI.service.ts               # QuizAIService.generateForLesson()
└── quizAI.errors.ts                # QuizAIError, MaxRetriesExceededError, LessonHasNoContentError
```

---

## Schemas

```ts
// QuizQuestionSchema
{
  question: string          // non-empty
  options:  string[]        // exactly 4 items
  correct:  string          // verbatim match of one option
}

// QuizOutputSchema
{
  questions: QuizQuestionSchema[]   // min 3, max 5
}
```

`model.withStructuredOutput(QuizOutputSchema)` enforces shape at the OpenAI layer;
`validateSemantics` enforces the `correct ∈ options` invariant afterward.

---

## Architecture

```mermaid
graph TD
    Router["quiz.generateAI\ntRPC mutation\n(instructorProcedure)"]
    Service["QuizAIService\n.generateForLesson()"]
    Guard{"lesson.content\nempty?"}
    Err1["throw LessonHasNoContentError\n→ BAD_REQUEST"]
    Seq["RunnableSequence\n① packageInputs\n② agent\n③ extractQuestions"]
    Agent["ReAct Agent\n(createReactAgent)"]
    T1["tool: get_lesson_content"]
    T2["tool: get_existing_quizzes"]
    LLM["gpt-4o-mini\nwithStructuredOutput"]
    Validate["validateSemantics()"]
    Ok["return QuizQuestion[]"]
    Retry{"attempt < 3?"}
    Err2["throw MaxRetriesExceededError\n→ INTERNAL_SERVER_ERROR"]

    Router --> Service
    Service --> Guard
    Guard -->|yes| Err1
    Guard -->|no| Seq
    Seq --> Agent
    Agent <-->|tool call| T1
    Agent <-->|tool call| T2
    Agent --> LLM
    LLM --> Validate
    Validate -->|valid| Ok
    Validate -->|invalid| Retry
    Retry -->|yes| Agent
    Retry -->|no| Err2
```

---

## Data Flow (sequence)

```mermaid
sequenceDiagram
    participant Router as tRPC Router
    participant Svc as QuizAIService
    participant Chain as RunnableSequence
    participant Agent as ReAct Agent
    participant T1 as getLessonContent
    participant T2 as getExistingQuizzes
    participant LLM as gpt-4o-mini

    Router->>Svc: generateForLesson(lessonId, count)
    Svc->>Svc: fetch lesson, check content ≠ null
    Svc->>Chain: runWithRetry(input)

    loop up to 3 attempts
        Chain->>Agent: {lessonId, count, hint?}
        Agent->>LLM: reason — what do I need?
        LLM-->>Agent: call get_lesson_content
        Agent->>T1: {lessonId}
        T1-->>Agent: "Title: …\n\n<content>"
        LLM-->>Agent: call get_existing_quizzes
        Agent->>T2: {lessonId}
        T2-->>Agent: "- Question A\n- Question B"
        Agent->>LLM: generate structured output
        LLM-->>Chain: QuizOutputSchema JSON
        Chain->>Svc: extractQuestions
        Svc->>Svc: validateSemantics()
        alt valid
            Svc-->>Router: QuizQuestion[]
        else invalid
            Svc->>Chain: retry with hint
        end
    end
```

---

## Retry Logic

```mermaid
flowchart TD
    A[invoke chain] --> B[parse structured output]
    B --> C{schema valid?}
    C -->|no — parse error| E
    C -->|yes| D{validateSemantics\nreturns null?}
    D -->|yes| G[return QuizQuestion[]]
    D -->|no — violation msg| E[log warn, capture hint]
    E --> F{attempt < 3?}
    F -->|yes| H["retry: add hint to input\ne.g. 'Question 2: correct not in options'"]
    H --> A
    F -->|no| I[throw MaxRetriesExceededError]
```

The `hint` string is appended to the next invocation's input so the agent sees
its own mistake and can correct it without a full context restart.

---

## Semantic Validation Rules

`validateSemantics(questions)` returns the first violation string or `null`.

| Rule | Violation message |
|------|------------------|
| `correct` not found in `options` | `"Question N: correct answer is not one of the options"` |
| Duplicate text within `options` of one question | `"Question N: duplicate options detected"` |
| Duplicate `question` text across the question set | `"Duplicate question text detected"` |

---

## Tools

### `get_lesson_content`

| | |
|---|---|
| **Name** | `get_lesson_content` |
| **Input schema** | `{ lessonId: string }` |
| **DB read** | `Lesson.title`, `Lesson.content` |
| **Returns (content present)** | `"Title: {title}\n\n{content}"` |
| **Returns (content null/empty)** | `"No text content found for this lesson."` |

### `get_existing_quizzes`

| | |
|---|---|
| **Name** | `get_existing_quizzes` |
| **Input schema** | `{ lessonId: string }` |
| **DB read** | all non-deleted `Quiz` rows for the lesson |
| **Returns (quizzes exist)** | one `"- {question}"` per line |
| **Returns (none)** | `"No existing questions for this lesson."` |
| **Purpose** | agent avoids regenerating questions already saved (F3) |

---

## System Prompt (outline)

The `ChatPromptTemplate` system message instructs the agent to:

1. Call `get_lesson_content` first — understand the material before writing questions.
2. Call `get_existing_quizzes` — never duplicate a question that already exists.
3. Produce exactly `{count}` multiple-choice questions.
4. Each question must have **exactly 4 options**; `correct` must be verbatim one of them.
5. Calibrate difficulty to the course `level` (Beginner / Intermediate / Advanced).
6. Output must conform to `QuizOutputSchema` — no extra keys, no markdown fences.

---

## tRPC Procedure

```ts
generateAI: instructorProcedure
  .input(z.object({
    lessonId: z.string(),
    count:    z.number().int().min(3).max(5).default(3),
  }))
  .mutation(async ({ ctx, input }) => {
    // 1. verifyInstructorOwnership(lessonId, instructorId)
    // 2. fetch lesson; if content empty → throw LessonHasNoContentError
    // 3. return quizAIService.generateForLesson(lessonId, input.count)
  })
```

---

## Error Mapping

| Error class | tRPC code | Client receives |
|-------------|-----------|----------------|
| `LessonHasNoContentError` | `BAD_REQUEST` | "Lesson has no content to generate quiz from" |
| `MaxRetriesExceededError` | `INTERNAL_SERVER_ERROR` | "Generation failed, try again" |
| `QuizAIError` (base) | `INTERNAL_SERVER_ERROR` | "Generation failed, try again" |
