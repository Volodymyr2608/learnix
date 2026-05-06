# Validation: AI Lesson Assistant

## Automated checks

| Command | Expectation |
|---|---|
| `pnpm typecheck` | No errors. |
| `pnpm check` | No lint or format issues (Biome). |
| `pnpm build` | Production build succeeds. |
| `pnpm db:generate` | Migration generated for `LessonAssistantConversation` and `LessonAssistantMessage`. |

## Manual scenarios

Run `pnpm dev` and `pnpm db:studio` side by side. Sign in as STUDENT enrolled in a course.

### S1 — Happy path

1. Open a lesson with `content` set.
2. **Verify**: the "Discussion" tab is replaced by the AI Lesson Assistant chat panel.
3. Type a question about the lesson content and send.
4. **Verify**: spinner appears; streamed tokens arrive and build up the response in real time.
5. **Verify** in Prisma Studio: a `LessonAssistantConversation` row exists for the student + lesson; two `LessonAssistantMessage` rows (user + assistant).

### S2 — Off-topic guardrail

1. Send a message clearly unrelated to the lesson topic (e.g., "What is the weather today?").
2. **Verify**: the assistant replies with a rejection message (from `OffTopicError`); no agent tool calls appear in the server log.

### S3 — Tool calls visible in server log

1. Send an on-topic question.
2. **Verify** in the server log: `get_lesson_content` tool is called; `get_student_progress` tool is called.
3. **Verify**: tool-call tokens do NOT appear in the client (only final answer tokens stream to the browser).

### S4 — Conversation history persists

1. Send three messages in a session, then close and reopen the lesson.
2. **Verify**: `getHistory` returns all prior messages; they render in the chat panel.
3. Click **Clear history**.
4. **Verify**: messages are gone from DB; chat panel resets.

### S5 — Auth gates

| Action | Role | Expected |
|---|---|---|
| POST to `/api/chat/lesson` with no session | anonymous | `401` |
| POST to `/api/chat/lesson` for a lesson the student is not enrolled in | STUDENT (not enrolled) | `403` |
| Call `lessonAssistant.getHistory` | INSTRUCTOR | `FORBIDDEN` (studentProcedure) |

### S6 — Abort / cancel

1. Send a message and immediately navigate away (or close the tab).
2. **Verify**: server log shows the stream was aborted cleanly (no unhandled error); no partial `LessonAssistantMessage` was saved.
