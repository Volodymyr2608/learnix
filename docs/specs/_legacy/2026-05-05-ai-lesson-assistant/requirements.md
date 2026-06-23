# Requirements: AI Lesson Assistant

## Status: planned — Phase 8 (v2 scope)

## Problem

Students watch a video or read lesson content and have no one to ask questions. The lesson viewer at `app/dashboard/courses/[courseId]/learn/page.tsx` already has a "Discussion" tab placeholder — this is the natural home for a per-lesson AI tutor.

Unlike the course builder (which is a raw `model.stream()` call), this feature is built as a proper pipeline: an input guardrail chain gates every message before an agent with tools handles it and streams a response.

### v2 additions (RAG, cross-lesson search, concept mastery)

The original v1 design pulled the **entire** lesson `content` into the prompt via a `get_lesson_content` tool. Two limits with that approach:

1. Long lessons (e.g., several thousand tokens of text body) blow the context budget and crowd out conversation history.
2. The agent has no way to answer "where in the course did we cover X" because it never sees other lessons.

v2 retains the agent + tools + guardrail pipeline but swaps the lesson-fetching tool for a RAG-based one and adds two more tools. It also persists per-lesson "concept mastery" so the tutor can adapt over time.

## Goal

An enrolled student opens a chat panel inside any lesson and asks questions. The AI answers using:

- **the relevant chunks** of the lesson's `content` (RAG retrieval over `LessonChunkEmbedding` from ADR-012),
- **cross-lesson context** when the question requires it,
- **the student's progress** to tailor explanations,
- **the student's concept mastery state** so the tutor adapts pacing.

Conversation history persists across sessions; concept mastery updates persist across the whole course.

## New DB models

```prisma
// prisma/schema/lessonAssistant.prisma

model LessonAssistantConversation {
  id        String   @id @default(cuid())
  lessonId  String
  studentId String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  lesson    Lesson  @relation(fields: [lessonId], references: [id], onDelete: Cascade)
  student   User    @relation(fields: [studentId], references: [id], onDelete: Cascade)
  messages  LessonAssistantMessage[]

  @@unique([lessonId, studentId])
}

model LessonAssistantMessage {
  id             String   @id @default(cuid())
  conversationId String
  role           String   // "user" | "assistant"
  content        String   @db.Text
  toolCalls      Json?    // optional snapshot of tool calls made on this turn
  createdAt      DateTime @default(now())

  conversation   LessonAssistantConversation @relation(
    fields: [conversationId], references: [id], onDelete: Cascade
  )
}

model ConceptMastery {
  id        String   @id @default(cuid())
  studentId String
  courseId  String
  concept   String   // free-form, agent-supplied
  level     Int      // 0 = unfamiliar, 1 = exposed, 2 = applied, 3 = mastered
  updatedAt DateTime @updatedAt

  student   User   @relation(fields: [studentId], references: [id], onDelete: Cascade)
  course    Course @relation(fields: [courseId], references: [id], onDelete: Cascade)

  @@unique([studentId, courseId, concept])
  @@index([studentId, courseId])
}
```

`LessonChunkEmbedding` (from ADR-012 / Phase 9) is reused — no new table is created here.

## Tools (v2)

| Tool | Replaces | Why |
|---|---|---|
| `retrieve_lesson_context(query)` | `get_lesson_content` | Top-k cosine search over the current lesson's `LessonChunkEmbedding` rows. Returns only the chunks relevant to the question. |
| `search_across_course(query)` | (new) | Top-k search across all `LessonChunkEmbedding` rows in the student's enrolled course. Used for "where did we cover X" / prerequisite questions. |
| `get_student_progress` | unchanged | Returns completed-lesson list. |
| `mark_concept_understood(concept, level)` | (new) | Upserts a `ConceptMastery` row. The agent calls this when the student demonstrates understanding ("I get it now"). |

## Files to create / modify

| Action | Path |
|---|---|
| New Prisma schema | `prisma/schema/lessonAssistant.prisma` (includes `ConceptMastery`) |
| New repository | `server/repositories/lessonAssistant.repository.ts` |
| New repository | `server/repositories/conceptMastery.repository.ts` |
| New chain | `server/services/lessonAI/chains/topicGuard.chain.ts` |
| New tool | `server/services/lessonAI/tools/retrieveLessonContext.tool.ts` (v2 RAG) |
| New tool | `server/services/lessonAI/tools/searchAcrossCourse.tool.ts` (v2) |
| New tool | `server/services/lessonAI/tools/getStudentProgress.tool.ts` |
| New tool | `server/services/lessonAI/tools/markConceptUnderstood.tool.ts` (v2) |
| New agent | `server/services/lessonAI/lessonAI.agent.ts` |
| New service | `server/services/lessonAI/lessonAI.service.ts` |
| New errors | `server/services/lessonAI/lessonAI.errors.ts` |
| New SSE endpoint | `app/api/chat/lesson/route.ts` |
| New router | `server/api/routers/lessonAssistant.ts` |
| Modify | `server/api/root.ts` — add lessonAssistant router |
| Modify | `app/dashboard/courses/[courseId]/learn/page.tsx` — replace Discussion tab |
| Reuses | `LessonChunkEmbedding` table from ADR-012 (semantic search feature) |

## Architectural decisions (v2)

- ADR-008 — agent + tools + guardrail chain pipeline.
- ADR-012 — pgvector embeddings; the RAG tools query `LessonChunkEmbedding`.
- ADR-013 — every conversation turn is traced with `feature:tutor`.

## Dependencies

- v2 of this spec depends on the `LessonChunkEmbedding` table and the embedding/chunking pipeline shipped by **2026-05-08-semantic-search-recommendations**. v2 of the assistant should not be implemented until that feature lands; v1 (without RAG) can ship independently.

## Estimated effort

| Task | Time |
|---|---|
| Prisma schema + migration + repository | 1 h |
| Guardrail chain | 1–2 h |
| Tools (2) + agent | 2–3 h |
| Service (orchestration + streaming) | 2–3 h |
| SSE endpoint | 1 h |
| tRPC procedures | 0.5 h |
| Chat UI + streaming hook wiring | 3–4 h |
| **Total** | **~2–2.5 days** |

## Future extensions

- **Quiz hint mode** — add a `get_quiz_question(quizId)` tool so the agent can give hints without revealing the answer.
- **Multi-lesson context** — expand `get_lesson_content` to also pull adjacent lessons for prerequisite questions.
- **Progress-aware pacing** — agent checks `get_student_progress` and slows down explanations for concepts the student hasn't reached yet.
