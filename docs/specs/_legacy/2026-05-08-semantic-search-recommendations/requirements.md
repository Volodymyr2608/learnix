# Requirements: Semantic Search & Course Recommendations

## Status: done — Phase 9

## Problem

Course discovery on `/dashboard/browse` currently uses `title LIKE '%q%'` (`server/repositories/course.repository.ts::getPublishedCourses`). It misses synonyms, intent, and any signal from the course's subtitle, description, or learning objectives. There is also no personalised "Recommended for you" surface — the dashboard at `app/dashboard/page.tsx` shows static content.

This feature replaces keyword search with semantic retrieval and adds a recommendations rail driven by the student's enrollment history. It also lays the embeddings infrastructure that the AI Course Tutor (Phase 8) reuses for its RAG tools.

## Goal

A student typing "build a chatbot" finds AI/LLM courses even when no title contains either word. A signed-in student sees a "Recommended for you" rail of courses similar to ones they have enrolled in, ranked by cosine similarity and excluding courses they are already enrolled in.

## Architectural decisions

- ADR-012 — pgvector for embeddings.
- ADR-013 — LangSmith tracing wraps all chains (optional in dev).
- ADR-008 — chain composition uses LCEL `RunnableSequence`.

## Functional requirements

| Surface | Behaviour |
|---|---|
| `/dashboard/browse` search | Free-text query → LCEL retrieval chain → ranked courses. Existing category and level filters are applied as SQL `WHERE` predicates **before** vector ordering. |
| `/dashboard` "Recommended for you" rail | Authenticated student → centroid of their enrolled-course embeddings → top-10 cosine-nearest courses excluding already-enrolled and unpublished. |
| Course publish | Publishing a course (existing service hook in `course.service.ts`) embeds `title + subtitle + description + objectives.join('\n')` and upserts `CourseEmbedding`. |
| Lesson save | Saving a lesson with non-empty `content` chunks the text and upserts `LessonChunkEmbedding` rows for that lesson. |
| Backfill | A `pnpm reindex` script iterates all published courses + all lessons with content. |

## New DB models

```prisma
// prisma/schema/embeddings.prisma

model CourseEmbedding {
  courseId  String   @id
  embedding Unsupported("vector(1536)")
  updatedAt DateTime @updatedAt

  course    Course   @relation(fields: [courseId], references: [id], onDelete: Cascade)
}

model LessonChunkEmbedding {
  id         String   @id @default(cuid())
  lessonId   String
  chunkIndex Int
  content    String   @db.Text
  embedding  Unsupported("vector(1536)")
  tokens     Int

  lesson     Lesson   @relation(fields: [lessonId], references: [id], onDelete: Cascade)

  @@unique([lessonId, chunkIndex])
  @@index([lessonId])
}

model UserInterestEmbedding {
  userId    String   @id
  embedding Unsupported("vector(1536)")
  updatedAt DateTime @updatedAt

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

A migration creates the `vector` extension and IVFFlat indexes:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE INDEX course_embedding_cosine_idx
  ON "CourseEmbedding" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX lesson_chunk_embedding_cosine_idx
  ON "LessonChunkEmbedding" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX user_interest_embedding_cosine_idx
  ON "UserInterestEmbedding" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
```

## Files to create / modify

| Action | Path |
|---|---|
| New Prisma schema | `prisma/schema/embeddings.prisma` |
| New migration | `prisma/migrations/<ts>_pgvector_init/migration.sql` |
| New service | `server/services/embeddings/embeddings.service.ts` |
| New helper | `server/services/embeddings/chunker.ts` |
| New service | `server/services/search/search.service.ts` |
| New service | `server/services/search/recommendations.service.ts` |
| New repository | `server/repositories/embedding.repository.ts` |
| New script | `scripts/reindex-embeddings.ts` (`pnpm reindex` script entry) |
| New router | `server/api/routers/search.ts` |
| Modify | `server/services/course/course.service.ts` — embed on publish |
| Modify | `server/services/lesson/lesson.service.ts` — re-embed on content save |
| Modify | `server/services/enrollment/enrollment.service.ts` — recompute user centroid on enroll/unenroll |
| Modify | `server/repositories/course.repository.ts` — new `findManyByIdsPreservingOrder` method (keeps cosine rank order) |
| Modify | `app/dashboard/browse/page.tsx` — call `search.semantic` |
| Modify | `app/dashboard/page.tsx` — add "Recommended for you" rail |
| Modify | `lib/env.js` — `OPENAI_API_KEY` already declared; no change |
| Modify | `package.json` — `reindex` script |

## Estimated effort

| Task | Time |
|---|---|
| Migration + Prisma schema + indexes | 1 h |
| Embeddings service + chunker | 2 h |
| Repository (raw SQL similarity helpers) | 1 h |
| Search service (LCEL retrieval chain) | 2 h |
| Recommendations service (centroid + filter) | 1.5 h |
| Hooks into course/lesson/enrollment services | 1.5 h |
| Backfill script | 1 h |
| tRPC router + client wiring | 1 h |
| Browse page + dashboard rail UI | 2 h |
| **Total** | **~1.5 days** |

## Out of scope

- Cross-encoder reranking (could be added later as another step in the LCEL chain).
- Hybrid search (BM25 + vector). Pure vector is the v1.
- Embedding-cost telemetry per course / per user.
- Multilingual embeddings — `text-embedding-3-small` works adequately across languages but is not optimal for non-English. Revisit if non-English content grows.

## Future extensions

- **Tutor RAG reuse.** `LessonChunkEmbedding` is the same table the Tutor's `retrieveLessonContext` and `searchAcrossCourse` tools query. No additional schema needed.
- **Trending vs personalised mix.** A second rail blending freshness signals with similarity.
- **Instructor-side analytics.** Use `UserInterestEmbedding` clustering to show instructors what audience archetypes their courses attract.
