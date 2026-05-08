# Requirements: Lesson Auto-Summary & Study Guide

## Status: planned — Phase 9

## Problem

Lessons store a `content` field with the full text body but no derived study aids. Students reading or watching a lesson have no quick recap, no surfaced key concepts, and no glossary. Instructors who want to add these manually duplicate effort.

This is also the place to demonstrate a **pure LCEL chain** pattern (per ADR-008) without an agent, contrasting with the agent-based features (Course Builder, Quiz Generator, Lesson Assistant). Three independent prompts run in parallel via `RunnableParallel` and the result is persisted alongside the lesson.

## Goal

When an instructor saves a lesson with non-empty `content`, they can click "Generate study guide" and within a few seconds see a summary, a key-concept list, and a glossary. Students viewing the lesson see the same study guide rendered as a card. The artefact is cached and only regenerated when the lesson content actually changes.

## Architectural decisions

- ADR-008 — uses LCEL `RunnableSequence` and `RunnableParallel`; structured output via `withStructuredOutput`. Pure chain; no agent, no tools.
- ADR-013 — every chain run is traced with `feature:summary`.

## Functional requirements

| Surface | Behaviour |
|---|---|
| Instructor lesson edit page | "Generate study guide" button. Disabled while a generation is in flight. Shows a "stale" badge when the cached `contentHash` no longer matches the current `content`. |
| Student lesson view | If `LessonInsights` exists for the lesson, render a card with three collapsible sections: Summary, Key Concepts, Glossary. |
| Cache | The `contentHash` (SHA-256 of `Lesson.content`) gates regeneration: matching hash → return cached row, no LLM calls. |
| Failure | If any of the three sub-chains fail validation twice in a row, the whole generation is rolled back; the row is not partially populated. |

## New DB models

```prisma
// prisma/schema/lesson.prisma — append

model LessonInsights {
  id           String   @id @default(cuid())
  lessonId     String   @unique
  summary      String   @db.Text
  concepts     Json     // [{ name: string, explanation: string }]
  glossary     Json     // [{ term: string, definition: string }]
  model        String
  contentHash  String
  generatedAt  DateTime @default(now())

  lesson       Lesson   @relation(fields: [lessonId], references: [id], onDelete: Cascade)

  @@index([lessonId])
}
```

## Files to create / modify

| Action | Path |
|---|---|
| New service | `server/services/lessonInsightsAI/lessonInsightsAI.service.ts` |
| New chain | `server/services/lessonInsightsAI/chains/summary.chain.ts` |
| New chain | `server/services/lessonInsightsAI/chains/concepts.chain.ts` |
| New chain | `server/services/lessonInsightsAI/chains/glossary.chain.ts` |
| New chain | `server/services/lessonInsightsAI/chains/parallel.chain.ts` |
| New schemas | `server/services/lessonInsightsAI/schemas/lessonInsights.schema.ts` |
| New errors | `server/services/lessonInsightsAI/lessonInsightsAI.errors.ts` |
| New repository | `server/repositories/lessonInsights.repository.ts` |
| Modify | `prisma/schema/lesson.prisma` — add `LessonInsights` |
| Modify | `server/api/routers/ai.ts` — add `generateLessonInsights`, `getLessonInsights` |
| Modify | `app/_components/Lesson/...` — student view insights card |
| Modify | instructor lesson edit page — "Generate study guide" button + stale badge |

## Estimated effort

| Task | Time |
|---|---|
| Migration + repository | 0.5 h |
| Three sub-chains + Zod schemas | 2 h |
| `RunnableParallel` composition + retry | 1 h |
| Service (cache check, invoke, persist) | 1 h |
| tRPC procedures + UI hooks | 2 h |
| Instructor button + student card | 2 h |
| **Total** | **~1 day** |

## Out of scope

- Streaming the generation. The student sees the result whole; intermediate streaming would require splitting the `RunnableParallel` into separate streamed runs, which we may add later.
- Translating the study guide. Lesson `content` language drives output language implicitly — explicit language selection is a future enhancement.
- Editing the generated content in place. Instructors can regenerate or override fields manually via Prisma Studio for now.

## Future extensions

- **Markdown anchors** — link key concepts back to specific paragraphs of `content`.
- **Audio summary** — TTS of the summary as an MP3 attached to the row.
- **Cross-lesson concept graph** — extract concepts across an entire course to power a "this builds on" view.
