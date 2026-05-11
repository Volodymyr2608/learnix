# Design: Semantic Search & Course Recommendations

**Date**: 2026-05-11
**Status**: Approved
**Spec source**: `docs/specs/2026-05-08-semantic-search-recommendations/`
**ADRs**: ADR-008 (LCEL), ADR-012 (pgvector), ADR-013 (LangSmith)

---

## 1. Schema & Migration

**New file**: `prisma/schema/embeddings.prisma` — three models:

- `CourseEmbedding` — `@id` on `courseId`, one row per published course.
- `LessonChunkEmbedding` — many rows per lesson, unique on `[lessonId, chunkIndex]`.
- `UserInterestEmbedding` — `@id` on `userId`, one row per student.

All embedding columns use `Unsupported("vector(1536)")` per ADR-012 rule 2.

**Migration SQL** (hand-written): enables `CREATE EXTENSION IF NOT EXISTS vector` first, then Prisma's generated `CREATE TABLE` statements, then three IVFFlat cosine indexes:
- `course_embedding_cosine_idx` — `lists = 100`
- `lesson_chunk_embedding_cosine_idx` — `lists = 100`
- `user_interest_embedding_cosine_idx` — `lists = 50`

The `Lesson`, `Course`, and `User` models in existing schema files get the corresponding relation fields.

---

## 2. Embeddings Layer

### `server/services/embeddings/chunker.ts`

Wraps LangChain `RecursiveCharacterTextSplitter` (`chunkSize: 1000`, `chunkOverlap: 100`). Returns `{ content: string; index: number }[]`.

### `server/services/embeddings/embeddings.service.ts`

Singleton `EmbeddingsService`. Uses `text-embedding-3-small` via `@langchain/openai`.

| Method | Behaviour |
|---|---|
| `embedCourse(course)` | Joins `title + subtitle + description + objectives`, upserts `CourseEmbedding`. |
| `embedLessonChunks(lesson)` | Chunks content, batch-embeds, replaces all `LessonChunkEmbedding` rows for that lesson. Deletes rows if content is empty. |
| `embedQuery(query)` | Returns raw `number[]` for the search chain. |
| `recomputeUserInterest(userId)` | Delegates to `embeddingRepository.recomputeUserInterestFromEnrollments`. |

### `server/repositories/embedding.repository.ts`

All vector queries via `db.$queryRaw` / `db.$executeRaw` (Prisma cannot express `<=>` operator natively).

| Method | SQL operation |
|---|---|
| `upsertCourseEmbedding` | `INSERT … ON CONFLICT DO UPDATE` |
| `replaceLessonChunks` | Delete existing rows, insert new batch |
| `deleteLessonChunks` | Delete all chunks for a lesson |
| `recomputeUserInterestFromEnrollments` | `AVG` of enrolled-course embeddings → upsert `UserInterestEmbedding` |
| `searchCourses(vector, limit, filters?)` | `<=>` cosine distance, optional `categoryId`/`level` predicates, `WHERE published = true AND deletedAt IS NULL` |
| `searchCoursesExcluding(vector, limit, excludeIds)` | Same as above + `NOT IN (enrolledIds)` |
| `findUserInterest(userId)` | Returns stored centroid vector |

---

## 3. Search & Recommendations Services + tRPC Router

### `server/services/search/search.service.ts`

LCEL `RunnableSequence` (ADR-008) with three steps:

1. `embedQuery(input.query)` → attaches `vector` to input
2. `embeddingRepository.searchCourses(vector, limit, filters)` → ranked id rows
3. `courseRepository.findManyByIdsPreservingOrder(ids)` → hydrated courses

Wrapped with `traced('search.semantic', ..., { feature: 'search' })` per ADR-013.

`courseRepository` gets a new helper `findManyByIdsPreservingOrder(ids: string[])` that preserves vector rank order (Postgres `ORDER BY` does not guarantee insertion order).

### `server/services/search/recommendations.service.ts`

Plain async method `forUser(userId, limit = 10)`:
1. Fetch `UserInterestEmbedding` — return `[]` if none.
2. Fetch enrolled course ids via new `enrollmentRepository.findEnrolledCourseIds(userId)`.
3. Call `embeddingRepository.searchCoursesExcluding(interest, limit, enrolledIds)`.
4. Hydrate via `courseRepository.findManyByIdsPreservingOrder(ids)`.

### `server/api/routers/search.ts`

| Procedure | Type | Input | Returns |
|---|---|---|---|
| `search.semantic` | `studentProcedure` | `{ query, categoryId?, level?, limit? }` | Course[] |
| `search.recommendations` | `studentProcedure` | none (uses `ctx.session.user.id`) | Course[] |

Registered in `server/api/root.ts` as `search`.

---

## 4. Service Hooks (incremental indexing)

All hooks are fire-and-forget: `void promise.catch(logger.error)`. Embedding failure never blocks the user-visible action.

| Service method | Trigger condition | Hook |
|---|---|---|
| `CourseService.updateCourse` | Status transitions to `PUBLISHED`, or title/subtitle/description/objectives changed on a published course | `embeddingsService.embedCourse(updatedCourse)` |
| `LessonService.updateLessonContent` | `content` is non-null | `embeddingsService.embedLessonChunks(lesson)` |
| `EnrollmentService.enrollInCourse` | Enrollment created or re-activated | `embeddingsService.recomputeUserInterest(studentId)` |
| `EnrollmentService.enrollInCourse` (cancel path) | Status set to `CANCELLED` | `embeddingsService.recomputeUserInterest(studentId)` |

The cancel hook lives inside the existing `enrollInCourse` method where the `CANCELLED` status branch is handled (there is no separate cancel method).

---

## 5. Backfill Script & UI

### `scripts/reindex-embeddings.ts`

Iterates sequentially (not batched) to respect OpenAI rate limits:
1. All published, non-deleted courses → `embedCourse`.
2. All lessons with non-null content → `embedLessonChunks`.
3. All users with at least one enrollment → `recomputeUserInterest`.

Added to `package.json` as `"reindex": "tsx scripts/reindex-embeddings.ts"`.

### Browse page — `app/dashboard/browse/page.tsx`

Replaces `title LIKE '%q%'` path with `api.search.semantic`. Existing category and level filter UI is unchanged; values pass as `categoryId`/`level` in the tRPC input.

### Dashboard recommendations rail

New component tree: `app/_components/Dashboard/components/RecommendedRail/`.

- Calls `api.search.recommendations`.
- Hidden when the result array is empty (zero enrollments or fewer than 3 results, enforced server-side in `recommendationsService.forUser`).
- Renders existing `CourseCard` components — no new card UI needed.
- Added to `app/dashboard/page.tsx`.

---

## New helpers required on existing repositories

| Repository | New method |
|---|---|
| `course.repository.ts` | `findManyByIdsPreservingOrder(ids: string[])` |
| `enrollment.repository.ts` | `findEnrolledCourseIds(userId: string): Promise<string[]>` |

---

## Out of scope

- Cross-encoder reranking
- Hybrid BM25 + vector search
- Embedding-cost telemetry per course/user
- Multilingual optimisation