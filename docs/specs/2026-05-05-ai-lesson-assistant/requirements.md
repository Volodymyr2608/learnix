# Requirements: AI Lesson Assistant

## Status: planned — Phase 8

## Problem

Students watch a video or read lesson content and have no one to ask questions. The lesson viewer at `app/dashboard/courses/[courseId]/learn/page.tsx` already has a "Discussion" tab placeholder — this is the natural home for a per-lesson AI tutor.

Unlike the course builder (which is a raw `model.stream()` call), this feature is built as a proper pipeline: an input guardrail chain gates every message before an agent with tools handles it and streams a response.

## Goal

An enrolled student opens a chat panel inside any lesson and asks questions. The AI answers using the lesson's `content` field as its knowledge base and can personalise responses using the student's progress. Conversation history persists across sessions.

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
  createdAt      DateTime @default(now())

  conversation   LessonAssistantConversation @relation(
    fields: [conversationId], references: [id], onDelete: Cascade
  )
}
```

## Files to create / modify

| Action | Path |
|---|---|
| New Prisma schema | `prisma/schema/lessonAssistant.prisma` |
| New repository | `server/repositories/lessonAssistant.repository.ts` |
| New chain | `server/services/lessonAI/chains/topicGuard.chain.ts` |
| New tool | `server/services/lessonAI/tools/getLessonContent.tool.ts` |
| New tool | `server/services/lessonAI/tools/getStudentProgress.tool.ts` |
| New agent | `server/services/lessonAI/lessonAI.agent.ts` |
| New service | `server/services/lessonAI/lessonAI.service.ts` |
| New errors | `server/services/lessonAI/lessonAI.errors.ts` |
| New SSE endpoint | `app/api/chat/lesson/route.ts` |
| New router | `server/api/routers/lessonAssistant.ts` |
| Modify | `server/api/root.ts` — add lessonAssistant router |
| Modify | `app/dashboard/courses/[courseId]/learn/page.tsx` — replace Discussion tab |

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
