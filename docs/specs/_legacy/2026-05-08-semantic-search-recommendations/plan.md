# Plan: Semantic Search & Course Recommendations

## Implementation order

1. Migration + Prisma schema (no service code yet).
2. Embeddings service + repository.
3. Backfill script — verify embeddings populate against existing data.
4. Search service (LCEL retrieval chain) + tRPC router.
5. Recommendations service.
6. Hooks into `course`, `lesson`, `enrollment` services for incremental updates.
7. UI changes.

---

## Step 1 — Migration & schema

`prisma/schema/embeddings.prisma` per the requirements doc. The migration enables the extension before the tables are created:

```sql
-- prisma/migrations/<ts>_pgvector_init/migration.sql

CREATE EXTENSION IF NOT EXISTS vector;

-- Prisma's generated CREATE TABLE statements run after this.

-- After tables are created, add IVFFlat indexes:
CREATE INDEX course_embedding_cosine_idx
  ON "CourseEmbedding" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX lesson_chunk_embedding_cosine_idx
  ON "LessonChunkEmbedding" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX user_interest_embedding_cosine_idx
  ON "UserInterestEmbedding" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
```

The Prisma `vector` column uses `Unsupported("vector(1536)")` which means it is unreadable through the Prisma client. All similarity queries go through `db.$queryRaw` in `embedding.repository.ts`.

---

## Step 2 — Embeddings service

```ts
// server/services/embeddings/embeddings.service.ts
import { OpenAIEmbeddings } from "@langchain/openai";
import { env } from "@/lib/env";
import { embeddingRepository } from "@/server/repositories/embedding.repository";
import { chunkLessonContent } from "./chunker";

const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-3-small",
  apiKey: env.OPENAI_API_KEY,
});

class EmbeddingsService {
  async embedCourse(course: {
    id: string;
    title: string;
    subtitle: string | null;
    description: string | null;
    objectives: string[];
  }) {
    const text = [
      course.title,
      course.subtitle,
      course.description,
      course.objectives.join("\n"),
    ]
      .filter(Boolean)
      .join("\n\n");
    const [vector] = await embeddings.embedDocuments([text]);
    await embeddingRepository.upsertCourseEmbedding(course.id, vector);
  }

  async embedLessonChunks(lesson: { id: string; content: string }) {
    const chunks = chunkLessonContent(lesson.content);
    if (chunks.length === 0) {
      await embeddingRepository.deleteLessonChunks(lesson.id);
      return;
    }
    const vectors = await embeddings.embedDocuments(chunks.map((c) => c.content));
    await embeddingRepository.replaceLessonChunks(lesson.id, chunks, vectors);
  }

  async embedQuery(query: string): Promise<number[]> {
    const [vector] = await embeddings.embedDocuments([query]);
    return vector;
  }

  async recomputeUserInterest(userId: string) {
    await embeddingRepository.recomputeUserInterestFromEnrollments(userId);
  }
}

export const embeddingsService = new EmbeddingsService();
```

`chunker.ts` uses LangChain's `RecursiveCharacterTextSplitter` with `chunkSize: 1000`, `chunkOverlap: 100`.

---

## Step 3 — Repository (raw SQL)

```ts
// server/repositories/embedding.repository.ts (excerpt)
import { Prisma } from "@/generated/prisma";
import { db } from "@/server/db";

class EmbeddingRepository {
  async upsertCourseEmbedding(courseId: string, vector: number[]) {
    const literal = `[${vector.join(",")}]`;
    await db.$executeRaw`
      INSERT INTO "CourseEmbedding" ("courseId", embedding, "updatedAt")
      VALUES (${courseId}, ${literal}::vector, NOW())
      ON CONFLICT ("courseId")
      DO UPDATE SET embedding = EXCLUDED.embedding, "updatedAt" = NOW();
    `;
  }

  async searchCourses(queryVector: number[], limit: number, where?: { categoryId?: string; level?: string }) {
    const literal = `[${queryVector.join(",")}]`;
    return db.$queryRaw<Array<{ id: string; distance: number }>>`
      SELECT c.id, ce.embedding <=> ${literal}::vector AS distance
      FROM "CourseEmbedding" ce
      JOIN "Course" c ON c.id = ce."courseId"
      WHERE c.published = true
        AND c."deletedAt" IS NULL
        ${where?.categoryId ? Prisma.sql`AND c."categoryId" = ${where.categoryId}` : Prisma.empty}
        ${where?.level ? Prisma.sql`AND c.level = ${where.level}` : Prisma.empty}
      ORDER BY distance ASC
      LIMIT ${limit};
    `;
  }
}
```

Lesson chunk and user interest helpers follow the same pattern.

---

## Step 4 — Search service (LCEL retrieval chain)

```ts
// server/services/search/search.service.ts
import { RunnableSequence } from "@langchain/core/runnables";
import { embeddingsService } from "@/server/services/embeddings/embeddings.service";
import { embeddingRepository } from "@/server/repositories/embedding.repository";
import { courseRepository } from "@/server/repositories/course.repository";

class SearchService {
  private chain = RunnableSequence.from([
    async (input: { query: string; filters?: { categoryId?: string; level?: string }; limit?: number }) => ({
      ...input,
      vector: await embeddingsService.embedQuery(input.query),
    }),
    async ({ vector, filters, limit = 20 }) =>
      embeddingRepository.searchCourses(vector, limit, filters),
    async (rows) => courseRepository.findManyByIdsPreservingOrder(rows.map((r) => r.id)),
  ]);

  semantic(input: { query: string; filters?: { categoryId?: string; level?: string }; limit?: number }) {
    return this.chain.invoke(input);
  }
}

export const searchService = new SearchService();
```

This chain is the LCEL demo for the feature: each step is a typed `Runnable`, the whole pipeline traces cleanly under LangSmith with one tag `feature:search`.

A new `findManyByIdsPreservingOrder(ids)` helper on `course.repository.ts` returns the same set of courses in the order specified by the id list (vector ranks would otherwise be lost by Postgres).

---

## Step 5 — Recommendations service

```ts
// server/services/search/recommendations.service.ts
class RecommendationsService {
  async forUser(userId: string, limit = 10) {
    const interest = await embeddingRepository.findUserInterest(userId);
    if (!interest) return [];
    const enrolledIds = await enrollmentRepository.findEnrolledCourseIds(userId);
    const rows = await embeddingRepository.searchCoursesExcluding(interest, limit, enrolledIds);
    return courseRepository.findManyByIdsPreservingOrder(rows.map((r) => r.id));
  }
}
```

`UserInterestEmbedding` is the centroid (mean) of the embeddings of the user's enrolled courses. It is recomputed inside `enrollment.service.ts` whenever an enrollment is created or removed.

---

## Step 6 — Service hooks

| Service | Hook |
|---|---|
| `course.service.ts::publish` | After publish: `embeddingsService.embedCourse(course)`. |
| `course.service.ts::update` | If `title / subtitle / description / objectives` changed: re-embed. |
| `lesson.service.ts::save` | If `content` changed: `embeddingsService.embedLessonChunks(lesson)`. |
| `enrollment.service.ts::create` and `cancel` | After commit: `embeddingsService.recomputeUserInterest(userId)`. |

Each hook is fire-and-forget with logged errors — embedding failure does not block the user-visible action.

---

## Step 7 — UI

**Browse page** — replace the existing search query path with a call to `search.semantic` via tRPC. The current category and level filter UI stays unchanged.

**Dashboard rail** — new component `app/_components/Dashboard/components/RecommendedRail/`. Renders top-10 results as the existing `CourseCard`. Hidden when the student has zero enrollments (centroid undefined) or fewer than 3 candidates.

---

## Backfill script

```ts
// scripts/reindex-embeddings.ts
async function main() {
  const courses = await db.course.findMany({ where: { published: true, deletedAt: null } });
  for (const course of courses) {
    await embeddingsService.embedCourse(course);
  }
  const lessons = await db.lesson.findMany({ where: { content: { not: null }, deletedAt: null } });
  for (const lesson of lessons) {
    await embeddingsService.embedLessonChunks(lesson);
  }
  const users = await db.user.findMany({ where: { enrollments: { some: {} } } });
  for (const u of users) {
    await embeddingsService.recomputeUserInterest(u.id);
  }
}
```

Run via `pnpm reindex` (added to `package.json`).
