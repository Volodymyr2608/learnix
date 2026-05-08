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

---

## v2 manual scenarios (RAG, cross-lesson, concept mastery)

Pre-req: the `2026-05-08-semantic-search-recommendations` feature has shipped and `pnpm reindex` has been run. The lesson under test has multi-paragraph `content` so chunking produces 3+ rows in `LessonChunkEmbedding`.

### S7 — RAG retrieves only relevant chunks

1. Open a lesson whose `content` covers two distinct subtopics.
2. Ask a question about subtopic A only.
3. **Verify** in the server log: `retrieve_lesson_context` is called with `query` matching the question's subject; the returned chunks are about subtopic A, not B.
4. **Verify** the answer references only subtopic A.

### S8 — Cross-lesson search

1. Ask: "Where in this course did we cover X?", where X is covered in a *different* lesson.
2. **Verify** in the server log: `search_across_course` is called.
3. **Verify** the answer cites the other lesson by title.

### S9 — Concept mastery is persisted

1. Engage the tutor in a back-and-forth where you eventually say something like "Okay, I understand how useEffect cleanup works now."
2. **Verify** in Prisma Studio: a `ConceptMastery` row appears for `(studentId, courseId, "useEffect cleanup")` at level 2 or 3.
3. Ask the tutor again about the same concept in a fresh conversation.
4. **Verify**: the assistant references your prior mastery (this requires the agent to call `get_student_progress` or to receive concept-mastery in the system prompt — confirm whichever is wired).

### S10 — Long-lesson token budget

1. Pick a lesson with `content` ≥ 5,000 tokens.
2. Open the chat and ask a focused question.
3. **Verify** in the LangSmith trace (or server log): the prompt sent to the model contains only retrieved chunks, not the full lesson body. Total prompt token count should be well under 3,000.

### S11 — Cross-lesson tool isolation

1. Sign in as STUDENT enrolled in course A.
2. Send a question whose answer would benefit from a lesson in course B (which the student is also enrolled in).
3. **Verify**: `search_across_course` only retrieves chunks from course A (the current course), not course B.

### S12 — LangSmith trace shape

1. With `LANGSMITH_TRACING=true`, ask a multi-step question.
2. **Verify** in LangSmith UI: the run is tagged `feature:tutor`; the trace tree shows `topic guard` → `agent` → tool calls (`retrieve_lesson_context`, possibly others) → final answer.
