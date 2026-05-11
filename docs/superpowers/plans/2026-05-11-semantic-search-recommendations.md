# Semantic Search & Course Recommendations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `title LIKE '%q%'` keyword search with pgvector semantic retrieval and add a "Recommended for you" rail on the student dashboard.

**Architecture:** Three new Prisma models (`CourseEmbedding`, `LessonChunkEmbedding`, `UserInterestEmbedding`) backed by IVFFlat cosine indexes. A `EmbeddingsService` generates vectors via `text-embedding-3-small`. A `SearchService` uses an LCEL `RunnableSequence` (ADR-008) to embed → query → hydrate. A `RecommendationsService` computes each student's interest centroid from their enrollments. Fire-and-forget hooks on course publish, lesson save, and enrollment change keep vectors current; `pnpm reindex` backfills existing data.

**Tech Stack:** pgvector extension, `@langchain/openai` (`OpenAIEmbeddings`), `@langchain/textsplitters` (`RecursiveCharacterTextSplitter`), `@langchain/core` (`RunnableSequence`), LangSmith `traced` wrapper (already in `server/services/_shared/tracing.ts`), Prisma `$queryRaw`/`$executeRaw` for all vector SQL.

---

## File Map

| Action | Path |
|---|---|
| Install | `@langchain/textsplitters` |
| **Create** | `prisma/schema/embeddings.prisma` |
| **Modify** | `prisma/schema/course.prisma` — add `CourseEmbedding?` relation |
| **Modify** | `prisma/schema/lesson.prisma` — add `LessonChunkEmbedding[]` relation |
| **Modify** | `prisma/schema/auth.prisma` — add `UserInterestEmbedding?` to `User` |
| **Create** | `prisma/migrations/<ts>_pgvector_init/migration.sql` |
| **Create** | `server/repositories/embedding.repository.ts` |
| **Create** | `server/services/embeddings/chunker.ts` |
| **Create** | `server/services/embeddings/embeddings.service.ts` |
| **Modify** | `server/repositories/course.repository.ts` — add `findManyByIdsPreservingOrder` |
| **Modify** | `server/repositories/enrollment.repository.ts` — add `findEnrolledCourseIds` |
| **Create** | `server/services/search/search.service.ts` |
| **Create** | `server/services/search/recommendations.service.ts` |
| **Create** | `server/api/routers/search.ts` |
| **Modify** | `server/api/root.ts` — register `searchRouter` |
| **Modify** | `server/services/course/course.service.ts` — embed hook on publish/update |
| **Modify** | `server/services/lesson/lesson.service.ts` — embed hook on content save |
| **Modify** | `server/services/enrollment/enrollment.service.ts` — centroid hook |
| **Create** | `scripts/reindex-embeddings.ts` |
| **Modify** | `package.json` — add `reindex` script |
| **Create** | `lib/requests/search/getSemanticSearchResults.ts` |
| **Modify** | `app/dashboard/browse/page.tsx` — use semantic search when `q` present |
| **Create** | `app/_components/Dashboard/components/RecommendedRail/index.tsx` |
| **Modify** | `app/dashboard/page.tsx` — add `RecommendedRail` |

---

## Task 1: Install dependency + Prisma schema + migration

**Files:**
- Run `pnpm add @langchain/textsplitters`
- Create: `prisma/schema/embeddings.prisma`
- Modify: `prisma/schema/course.prisma`
- Modify: `prisma/schema/lesson.prisma`
- Modify: `prisma/schema/auth.prisma`
- Create: `prisma/migrations/<ts>_pgvector_init/migration.sql`

- [ ] **Step 1: Install @langchain/textsplitters**

```bash
cd /path/to/learnix && pnpm add @langchain/textsplitters
```

- [ ] **Step 2: Create the embeddings Prisma schema file**

Create `prisma/schema/embeddings.prisma`:

```prisma
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

- [ ] **Step 3: Add relation to course.prisma**

In `prisma/schema/course.prisma`, inside the `Course` model block (after the existing `reviews CourseReview[]` line), add:

```prisma
  embedding        CourseEmbedding?
```

- [ ] **Step 4: Add relation to lesson.prisma**

In `prisma/schema/lesson.prisma`, inside the `Lesson` model block (after `lessonInsights LessonInsights?`), add:

```prisma
  chunkEmbeddings  LessonChunkEmbedding[]
```

- [ ] **Step 5: Add relation to auth.prisma**

In `prisma/schema/auth.prisma`, inside the `User` model block (after `courseReviews CourseReview[]`), add:

```prisma
  interestEmbedding UserInterestEmbedding?
```

- [ ] **Step 6: Generate the migration (create-only, do not apply yet)**

```bash
pnpm db:generate -- --name pgvector_init --create-only
```

Expected output: `Prisma Migrate created the following migration without applying it 20260511XXXXXX_pgvector_init`

Note the generated directory name — you will edit it in the next step.

- [ ] **Step 7: Edit the generated migration SQL**

Open `prisma/migrations/20260511XXXXXX_pgvector_init/migration.sql`.

Prepend this line **before** all `CREATE TABLE` statements:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Append these lines **after** all `CREATE TABLE` and `ADD CONSTRAINT` statements at the very end of the file:

```sql
CREATE INDEX course_embedding_cosine_idx
  ON "CourseEmbedding" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX lesson_chunk_embedding_cosine_idx
  ON "LessonChunkEmbedding" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX user_interest_embedding_cosine_idx
  ON "UserInterestEmbedding" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
```

- [ ] **Step 8: Apply the migration and regenerate Prisma client**

Make sure the Docker database is running (`docker-compose up -d`), then:

```bash
pnpm db:migrate && pnpm generate
```

Expected: migration applies without error, Prisma client regenerated.

- [ ] **Step 9: Verify types compile**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add prisma/ package.json pnpm-lock.yaml
git commit -m "feat: add pgvector schema, migration, and install textsplitters"
```

---

## Task 2: Embedding repository

**Files:**
- Create: `server/repositories/embedding.repository.ts`

- [ ] **Step 1: Create the embedding repository**

Create `server/repositories/embedding.repository.ts`:

```ts
import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma";
import { db } from "@/server/db";

class EmbeddingRepository {
  async upsertCourseEmbedding(courseId: string, vector: number[]) {
    const literal = `[${vector.join(",")}]`;
    await db.$executeRaw`
      INSERT INTO "CourseEmbedding" ("courseId", embedding, "updatedAt")
      VALUES (${courseId}, ${literal}::vector, NOW())
      ON CONFLICT ("courseId")
      DO UPDATE SET embedding = EXCLUDED.embedding, "updatedAt" = NOW()
    `;
  }

  async deleteLessonChunks(lessonId: string) {
    await db.$executeRaw`
      DELETE FROM "LessonChunkEmbedding" WHERE "lessonId" = ${lessonId}
    `;
  }

  async replaceLessonChunks(
    lessonId: string,
    chunks: Array<{ content: string; index: number }>,
    vectors: number[][],
  ) {
    await db.$transaction([
      db.$executeRaw`DELETE FROM "LessonChunkEmbedding" WHERE "lessonId" = ${lessonId}`,
      ...chunks.map((chunk, i) => {
        const id = randomUUID();
        const literal = `[${vectors[i]!.join(",")}]`;
        const tokens = Math.ceil(chunk.content.length / 4);
        return db.$executeRaw`
          INSERT INTO "LessonChunkEmbedding" (id, "lessonId", "chunkIndex", content, embedding, tokens)
          VALUES (${id}, ${lessonId}, ${chunk.index}, ${chunk.content}, ${literal}::vector, ${tokens})
        `;
      }),
    ]);
  }

  async recomputeUserInterestFromEnrollments(userId: string) {
    await db.$executeRaw`
      DELETE FROM "UserInterestEmbedding" WHERE "userId" = ${userId}
    `;
    await db.$executeRaw`
      INSERT INTO "UserInterestEmbedding" ("userId", embedding, "updatedAt")
      SELECT ${userId}, AVG(ce.embedding), NOW()
      FROM "CourseEmbedding" ce
      JOIN enrollments e ON e."courseId" = ce."courseId"
      WHERE e."studentId" = ${userId}
        AND e.status = 'active'
      HAVING COUNT(*) > 0
    `;
  }

  async findUserInterest(userId: string): Promise<number[] | null> {
    const rows = await db.$queryRaw<Array<{ embedding: string }>>`
      SELECT embedding::text AS embedding
      FROM "UserInterestEmbedding"
      WHERE "userId" = ${userId}
    `;
    if (rows.length === 0) return null;
    return JSON.parse(rows[0]!.embedding);
  }

  async searchCourses(
    queryVector: number[],
    limit: number,
    where?: { category?: string; level?: string },
  ) {
    const literal = `[${queryVector.join(",")}]`;
    const categoryClause = where?.category
      ? Prisma.sql`AND c.category = ${where.category}`
      : Prisma.empty;
    const levelClause = where?.level
      ? Prisma.sql`AND c.level = ${where.level}`
      : Prisma.empty;

    return db.$queryRaw<Array<{ id: string; distance: number }>>`
      SELECT c.id, ce.embedding <=> ${literal}::vector AS distance
      FROM "CourseEmbedding" ce
      JOIN courses c ON c.id = ce."courseId"
      WHERE c.status = 'published'
        AND c.deleted_at IS NULL
        ${categoryClause}
        ${levelClause}
      ORDER BY distance ASC
      LIMIT ${limit}
    `;
  }

  async searchCoursesExcluding(
    queryVector: number[],
    limit: number,
    excludeIds: string[],
  ) {
    const literal = `[${queryVector.join(",")}]`;
    const excludeClause =
      excludeIds.length > 0
        ? Prisma.sql`AND c.id NOT IN (${Prisma.join(excludeIds.map((id) => Prisma.sql`${id}`))})`
        : Prisma.empty;

    return db.$queryRaw<Array<{ id: string; distance: number }>>`
      SELECT c.id, ce.embedding <=> ${literal}::vector AS distance
      FROM "CourseEmbedding" ce
      JOIN courses c ON c.id = ce."courseId"
      WHERE c.status = 'published'
        AND c.deleted_at IS NULL
        ${excludeClause}
      ORDER BY distance ASC
      LIMIT ${limit}
    `;
  }
}

export const embeddingRepository = new EmbeddingRepository();
```

- [ ] **Step 2: Verify**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/repositories/embedding.repository.ts
git commit -m "feat: add embedding repository with pgvector raw SQL helpers"
```

---

## Task 3: Embeddings service + chunker

**Files:**
- Create: `server/services/embeddings/chunker.ts`
- Create: `server/services/embeddings/embeddings.service.ts`

- [ ] **Step 1: Create the chunker**

Create `server/services/embeddings/chunker.ts`:

```ts
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 100,
});

export async function chunkLessonContent(
  content: string,
): Promise<Array<{ content: string; index: number }>> {
  if (!content.trim()) return [];
  const docs = await splitter.createDocuments([content]);
  return docs.map((doc, index) => ({ content: doc.pageContent, index }));
}
```

- [ ] **Step 2: Create the embeddings service**

Create `server/services/embeddings/embeddings.service.ts`:

```ts
import { OpenAIEmbeddings } from "@langchain/openai";
import { env } from "@/lib/env";
import { embeddingRepository } from "@/server/repositories/embedding.repository";
import { logger } from "@/server/utils/logger";
import { chunkLessonContent } from "./chunker";

const model = new OpenAIEmbeddings({
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
    const [vector] = await model.embedDocuments([text]);
    if (!vector) throw new Error("Embedding returned no vector");
    await embeddingRepository.upsertCourseEmbedding(course.id, vector);
  }

  async embedLessonChunks(lesson: { id: string; content: string }) {
    const chunks = await chunkLessonContent(lesson.content);
    if (chunks.length === 0) {
      await embeddingRepository.deleteLessonChunks(lesson.id);
      return;
    }
    const vectors = await model.embedDocuments(chunks.map((c) => c.content));
    await embeddingRepository.replaceLessonChunks(lesson.id, chunks, vectors);
  }

  async embedQuery(query: string): Promise<number[]> {
    const [vector] = await model.embedDocuments([query]);
    if (!vector) throw new Error("Embedding returned no vector");
    return vector;
  }

  async recomputeUserInterest(userId: string) {
    await embeddingRepository.recomputeUserInterestFromEnrollments(userId);
  }
}

export const embeddingsService = new EmbeddingsService();
```

- [ ] **Step 3: Verify**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add server/services/embeddings/
git commit -m "feat: add embeddings service and lesson chunker"
```

---

## Task 4: Repository helpers + Search service + Recommendations service

**Files:**
- Modify: `server/repositories/course.repository.ts`
- Modify: `server/repositories/enrollment.repository.ts`
- Create: `server/services/search/search.service.ts`
- Create: `server/services/search/recommendations.service.ts`

- [ ] **Step 1: Add `findManyByIdsPreservingOrder` to CourseRepository**

In `server/repositories/course.repository.ts`, add this import at the top:

```ts
import { CourseStatus } from "@/generated/prisma";
```

Then add this method to the `CourseRepository` class (before the closing `}`):

```ts
async findManyByIdsPreservingOrder(ids: string[]) {
  if (ids.length === 0) return [];
  const courses = await this.db.course.findMany({
    where: {
      id: { in: ids },
      status: CourseStatus.published,
      deletedAt: null,
    },
    include: {
      instructor: { select: { name: true } },
      _count: { select: { enrollments: true } },
    },
  });
  const map = new Map(courses.map((c) => [c.id, c]));
  return ids
    .map((id) => map.get(id))
    .filter((c): c is NonNullable<typeof c> => c != null)
    .map((course) => ({
      id: course.id,
      title: course.title,
      instructor: course.instructor.name,
      rating: 4.8,
      students: course._count.enrollments,
      duration: course.duration,
      price: course.price,
      level: course.level,
      thumbnail: course.thumbnailUrl,
      category: course.category,
    }));
}
```

- [ ] **Step 2: Add `findEnrolledCourseIds` to EnrollmentRepository**

In `server/repositories/enrollment.repository.ts`, replace the entire file with:

```ts
import type { Enrollment, Prisma } from "@/generated/prisma";
import { EnrollmentStatus } from "@/generated/prisma";
import { BaseRepository } from "@/server/repositories/base/base.repository";

export default class EnrollmentRepository extends BaseRepository<
  "enrollment",
  Enrollment,
  Prisma.EnrollmentUncheckedCreateInput,
  Prisma.EnrollmentUpdateInput,
  Prisma.EnrollmentWhereInput,
  Prisma.EnrollmentInclude,
  Prisma.EnrollmentSelect,
  Prisma.EnrollmentOrderByWithRelationInput
> {
  protected readonly modelName = "enrollment";

  async findEnrolledCourseIds(userId: string): Promise<string[]> {
    const rows = await this.findMany({
      where: {
        studentId: userId,
        status: { in: [EnrollmentStatus.active, EnrollmentStatus.completed] },
      },
      select: { courseId: true },
    });
    return rows.map((r) => (r as { courseId: string }).courseId);
  }
}

export const enrollmentRepository = new EnrollmentRepository();
```

- [ ] **Step 3: Create the search service**

Create `server/services/search/search.service.ts`:

```ts
import { RunnableSequence } from "@langchain/core/runnables";
import { courseRepository } from "@/server/repositories/course.repository";
import { embeddingRepository } from "@/server/repositories/embedding.repository";
import { traced } from "@/server/services/_shared/tracing";
import { embeddingsService } from "@/server/services/embeddings/embeddings.service";

type SearchInput = {
  query: string;
  filters?: { category?: string; level?: string };
  limit?: number;
};

class SearchService {
  private readonly chain = RunnableSequence.from([
    async (input: SearchInput) => ({
      ...input,
      vector: await embeddingsService.embedQuery(input.query),
    }),
    async (input: SearchInput & { vector: number[] }) =>
      embeddingRepository.searchCourses(
        input.vector,
        input.limit ?? 20,
        input.filters,
      ),
    async (rows: Array<{ id: string; distance: number }>) =>
      courseRepository.findManyByIdsPreservingOrder(rows.map((r) => r.id)),
  ]);

  semantic(input: SearchInput) {
    return traced(
      "search.semantic",
      (i: SearchInput) => this.chain.invoke(i),
      { feature: "search" },
    )(input);
  }
}

export const searchService = new SearchService();
```

- [ ] **Step 4: Create the recommendations service**

Create `server/services/search/recommendations.service.ts`:

```ts
import { courseRepository } from "@/server/repositories/course.repository";
import { embeddingRepository } from "@/server/repositories/embedding.repository";
import { enrollmentRepository } from "@/server/repositories/enrollment.repository";

const MIN_RECOMMENDATIONS = 3;

class RecommendationsService {
  async forUser(userId: string, limit = 10) {
    const interest = await embeddingRepository.findUserInterest(userId);
    if (!interest) return [];

    const enrolledIds = await enrollmentRepository.findEnrolledCourseIds(userId);
    const rows = await embeddingRepository.searchCoursesExcluding(
      interest,
      limit,
      enrolledIds,
    );

    if (rows.length < MIN_RECOMMENDATIONS) return [];

    return courseRepository.findManyByIdsPreservingOrder(
      rows.map((r) => r.id),
    );
  }
}

export const recommendationsService = new RecommendationsService();
```

- [ ] **Step 5: Verify**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add server/repositories/course.repository.ts server/repositories/enrollment.repository.ts server/services/search/
git commit -m "feat: add search and recommendations services with repo helpers"
```

---

## Task 5: tRPC search router

**Files:**
- Create: `server/api/routers/search.ts`
- Modify: `server/api/root.ts`

- [ ] **Step 1: Create the search router**

Create `server/api/routers/search.ts`:

```ts
import { z } from "zod";
import { recommendationsService } from "@/server/services/search/recommendations.service";
import { searchService } from "@/server/services/search/search.service";
import { handleServiceError } from "@/server/utils/handleServiceError";
import { createTRPCRouter, studentProcedure } from "../trpc";

export const searchRouter = createTRPCRouter({
  semantic: studentProcedure
    .input(
      z.object({
        query: z.string().min(1),
        category: z.string().optional(),
        level: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
    )
    .query(async ({ input }) => {
      try {
        return await searchService.semantic({
          query: input.query,
          filters: {
            category: input.category,
            level: input.level,
          },
          limit: input.limit,
        });
      } catch (error) {
        handleServiceError(error);
      }
    }),

  recommendations: studentProcedure.query(async ({ ctx }) => {
    try {
      return await recommendationsService.forUser(ctx.session.user.id);
    } catch (error) {
      handleServiceError(error);
    }
  }),
});
```

- [ ] **Step 2: Register the router in root.ts**

In `server/api/root.ts`, add the import:

```ts
import { searchRouter } from "@/server/api/routers/search";
```

And add `search: searchRouter` to the `appRouter` object:

```ts
export const appRouter = createTRPCRouter({
  user: userRouter,
  course: courseRouter,
  courseAI: courseAIRouter,
  instructor: instructorRouter,
  lesson: lessonRouter,
  lessonInsightsAI: lessonInsightsAIRouter,
  quiz: quizRouter,
  search: searchRouter,
});
```

- [ ] **Step 3: Verify**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add server/api/routers/search.ts server/api/root.ts
git commit -m "feat: add search tRPC router (semantic + recommendations)"
```

---

## Task 6: Service hooks (fire-and-forget incremental indexing)

**Files:**
- Modify: `server/services/course/course.service.ts`
- Modify: `server/services/lesson/lesson.service.ts`
- Modify: `server/services/enrollment/enrollment.service.ts`

- [ ] **Step 1: Add embed hook to CourseService**

In `server/services/course/course.service.ts`, add this import at the top of the file:

```ts
import { embeddingsService } from "@/server/services/embeddings/embeddings.service";
```

Then in the `updateCourse` method, **after** the `return { ...course, sections: updatedSections };` line and still inside the `transaction` callback, add nothing — instead, **after** the entire `transaction(async () => { ... })` call completes, fire the embed hook. Replace the `updateCourse` method's try block structure so the hook fires after the transaction:

Find the block ending with:
```ts
        return {
          ...course,
          sections: updatedSections,
        };
      });
    } catch (error: unknown) {
```

Change it to:
```ts
        return {
          ...course,
          sections: updatedSections,
        };
      });

      const shouldEmbed =
        result.status === "published" &&
        (existingBeforeUpdate?.status !== "published" ||
          ["title", "subtitle", "description"].some(
            (k) =>
              (incomingCourseData as Record<string, unknown>)[k] !== undefined,
          ) ||
          incomingCourseData.objectives !== undefined);

      if (shouldEmbed) {
        void embeddingsService
          .embedCourse({
            id: result.id,
            title: result.title,
            subtitle: result.subtitle ?? null,
            description: result.description ?? null,
            objectives: result.objectives,
          })
          .catch((err) => logger.error("embedCourse failed:", err));
      }

      return result;
    } catch (error: unknown) {
```

To implement this cleanly, the `updateCourse` method needs to capture `existingBeforeUpdate`. Look at the current `updateCourse` implementation — it already fetches `existingCourse` inside the transaction. Capture the status before the update by storing it in a variable outside the transaction scope.

Replace the full `updateCourse` method with:

```ts
async updateCourse(courseId: string, dto: CourseFullUpdateDto) {
  try {
    const { sections: newSections, ...incomingCourseData } = dto;
    let existingStatus: string | undefined;

    const result = await courseRepository.transaction(async () => {
      const existingCourse = await courseRepository.findFirst({
        where: { id: courseId },
        include: {
          sections: { include: { lessons: true } },
        },
      });

      if (!existingCourse) {
        throw new CourseError(`Course ${courseId} not found`, "NOT_FOUND");
      }

      existingStatus = existingCourse.status;

      const courseDataToUpdate = this.prepareCourseUpdate(
        existingCourse as CourseWithSections,
        incomingCourseData,
      );

      const course = await courseRepository.update(
        courseId,
        courseDataToUpdate,
      );

      const existingSections = (existingCourse as CourseWithSections).sections;

      const updatedSections = await this.syncSections(
        existingSections,
        newSections,
        courseId,
      );

      await this.syncLessons(existingSections, newSections, updatedSections);

      return {
        ...course,
        sections: updatedSections,
      };
    });

    const isPublished = result.status === "published";
    const wasJustPublished = existingStatus !== "published" && isPublished;
    const embeddableFieldChanged =
      incomingCourseData.title !== undefined ||
      incomingCourseData.subtitle !== undefined ||
      incomingCourseData.description !== undefined ||
      incomingCourseData.objectives !== undefined;

    if (isPublished && (wasJustPublished || embeddableFieldChanged)) {
      void embeddingsService
        .embedCourse({
          id: result.id,
          title: result.title,
          subtitle: result.subtitle ?? null,
          description: result.description ?? null,
          objectives: result.objectives,
        })
        .catch((err) => logger.error("embedCourse failed:", err));
    }

    return result;
  } catch (error: unknown) {
    logger.error("Error updating course:", error);
    throw new CourseError(
      "Failed to update course",
      "INTERNAL_SERVER_ERROR",
      error,
      { dto },
    );
  }
}
```

- [ ] **Step 2: Add embed hook to LessonService**

In `server/services/lesson/lesson.service.ts`, add this import:

```ts
import { embeddingsService } from "@/server/services/embeddings/embeddings.service";
import { logger } from "@/server/utils/logger";
```

Then in `updateLessonContent`, after the `return await lessonRepository.transaction(...)` result is assigned, fire the embed hook. Replace the return statement:

Find:
```ts
      return await lessonRepository.transaction(async () => {
        const updated = await lessonRepository.update(lessonId, {
          title: dto.title,
          description: dto.description ?? null,
          duration: dto.duration ?? null,
          videoUrl: dto.videoUrl ?? null,
          content: dto.content ?? null,
          resources: dto.resources ?? [],
        });

        if (dto.quizzes !== undefined) {
          await this.syncQuizzes(lessonId, dto.quizzes, existing.quizzes);
        }

        return updated;
      });
```

Replace with:

```ts
      const updated = await lessonRepository.transaction(async () => {
        const result = await lessonRepository.update(lessonId, {
          title: dto.title,
          description: dto.description ?? null,
          duration: dto.duration ?? null,
          videoUrl: dto.videoUrl ?? null,
          content: dto.content ?? null,
          resources: dto.resources ?? [],
        });

        if (dto.quizzes !== undefined) {
          await this.syncQuizzes(lessonId, dto.quizzes, existing.quizzes);
        }

        return result;
      });

      if (updated.content) {
        void embeddingsService
          .embedLessonChunks({ id: lessonId, content: updated.content })
          .catch((err) => logger.error("embedLessonChunks failed:", err));
      }

      return updated;
```

- [ ] **Step 3: Add centroid hook to EnrollmentService**

In `server/services/enrollment/enrollment.service.ts`, add this import:

```ts
import { embeddingsService } from "@/server/services/embeddings/embeddings.service";
```

Then in `enrollInCourse`, after the enrollment is created (after `return { alreadyEnrolled: false };`), fire the hook. And after the `CANCELLED` status is reactivated (`return { alreadyEnrolled: true };`), also fire the hook.

Replace the entire `enrollInCourse` method with:

```ts
async enrollInCourse(studentId: string, courseId: string) {
  try {
    const course = await courseRepository.findFirst({
      where: {
        id: courseId,
        status: "published",
        deletedAt: null,
      },
      select: {
        id: true,
        instructorId: true,
      },
    });

    if (!course) {
      throw new EnrollmentError("Course not found", "NOT_FOUND", undefined, {
        courseId,
      });
    }

    if (course.instructorId === studentId) {
      throw new EnrollmentError(
        "You cannot enroll in your own course",
        "BAD_REQUEST",
        undefined,
        { courseId, studentId },
      );
    }

    const existingEnrollment = await enrollmentRepository.findFirst({
      where: {
        studentId,
        courseId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    let alreadyEnrolled = true;

    if (!existingEnrollment) {
      await enrollmentRepository.create({
        studentId,
        courseId,
        status: EnrollmentStatus.active,
      });
      alreadyEnrolled = false;
    } else if (existingEnrollment.status === EnrollmentStatus.cancelled) {
      await enrollmentRepository.update(existingEnrollment.id, {
        status: EnrollmentStatus.active,
        enrolledAt: new Date(),
        completedAt: null,
      });
    }

    void embeddingsService
      .recomputeUserInterest(studentId)
      .catch((err) => logger.error("recomputeUserInterest failed:", err));

    return { alreadyEnrolled };
  } catch (error) {
    if (error instanceof EnrollmentError) {
      throw error;
    }

    logger.error("Failed to enroll student in course:", error);
    throw new EnrollmentError(
      "Failed to enroll in this course",
      "BAD_REQUEST",
      error,
      {
        studentId,
        courseId,
      },
    );
  }
}
```

- [ ] **Step 4: Verify**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add server/services/course/course.service.ts server/services/lesson/lesson.service.ts server/services/enrollment/enrollment.service.ts
git commit -m "feat: add fire-and-forget embedding hooks to course, lesson, and enrollment services"
```

---

## Task 7: Backfill script

**Files:**
- Create: `scripts/reindex-embeddings.ts`
- Modify: `package.json`

- [ ] **Step 1: Create the reindex script**

Create `scripts/reindex-embeddings.ts`:

```ts
import { db } from "@/server/db";
import { embeddingsService } from "@/server/services/embeddings/embeddings.service";

async function main() {
  console.log("Reindexing courses...");
  const courses = await db.course.findMany({
    where: { status: "published", deletedAt: null },
    select: {
      id: true,
      title: true,
      subtitle: true,
      description: true,
      objectives: true,
    },
  });
  for (const course of courses) {
    await embeddingsService.embedCourse({
      id: course.id,
      title: course.title,
      subtitle: course.subtitle ?? null,
      description: course.description ?? null,
      objectives: course.objectives,
    });
    console.log(`  ✓ course ${course.id}`);
  }

  console.log("Reindexing lessons...");
  const lessons = await db.lesson.findMany({
    where: { content: { not: null }, deletedAt: null },
    select: { id: true, content: true },
  });
  for (const lesson of lessons) {
    await embeddingsService.embedLessonChunks({
      id: lesson.id,
      content: lesson.content!,
    });
    console.log(`  ✓ lesson ${lesson.id}`);
  }

  console.log("Recomputing user interest embeddings...");
  const users = await db.user.findMany({
    where: { enrollments: { some: {} } },
    select: { id: true },
  });
  for (const user of users) {
    await embeddingsService.recomputeUserInterest(user.id);
    console.log(`  ✓ user ${user.id}`);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add reindex script to package.json**

In `package.json`, find the `"scripts"` block and add:

```json
"reindex": "tsx scripts/reindex-embeddings.ts",
```

- [ ] **Step 3: Verify**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add scripts/reindex-embeddings.ts package.json
git commit -m "feat: add pnpm reindex backfill script"
```

---

## Task 8: Browse page — semantic search

**Files:**
- Create: `lib/requests/search/getSemanticSearchResults.ts`
- Modify: `app/dashboard/browse/page.tsx`

- [ ] **Step 1: Create the semantic search request helper**

Create `lib/requests/search/getSemanticSearchResults.ts`:

```ts
import { api } from "@/trpc/server";
import type { PublishedCourse } from "@/lib/requests/course/getPublishedCourses";

export type SemanticSearchResult = PublishedCourse;

export const getSemanticSearchResults = async (params: {
  query: string;
  category?: string;
  level?: string;
}): Promise<SemanticSearchResult[]> => {
  try {
    const results = await api.search.semantic({
      query: params.query,
      category: params.category,
      level: params.level,
    });
    return results ?? [];
  } catch (error) {
    console.error(error);
    return [];
  }
};
```

- [ ] **Step 2: Update the browse page**

Replace `app/dashboard/browse/page.tsx` with:

```tsx
import BrowseCourses from "@/app/_components/Course/components/BrowseCourses";
import { CoursePagination } from "@/app/_components/Course/components/CoursePagination";
import { getPublishedCourses } from "@/lib/requests/course/getPublishedCourses";
import { getSemanticSearchResults } from "@/lib/requests/search/getSemanticSearchResults";
import getStudentEnrolledCourses from "@/lib/requests/course/getStudentEnrolledCourses";

const PAGE_SIZE = 9;

const BrowseCoursesPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; page?: string }>;
}) => {
  const { q, category, page = "1" } = await searchParams;
  const currentPage = Math.max(1, Number(page) || 1);
  const currentCategory = category && category !== "all" ? category : undefined;

  const [courseResult, { courses: enrolledCourses }] = await Promise.all([
    q
      ? getSemanticSearchResults({ query: q, category: currentCategory }).then(
          (courses) => ({ courses, total: courses.length }),
        )
      : getPublishedCourses({ category: currentCategory, page: currentPage }),
    getStudentEnrolledCourses(),
  ]);

  const { courses, total } = courseResult;
  const totalPages = q ? 1 : Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  const enrolledMap: Record<string, string | null> = {};
  for (const c of enrolledCourses) {
    enrolledMap[c.id] = c.nextLessonId;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-3xl tracking-tight">Browse Courses</h1>
        <p className="text-muted-foreground">
          Discover new skills and expand your knowledge
        </p>
      </div>

      <BrowseCourses
        category={category ?? "all"}
        courses={courses}
        enrolledMap={enrolledMap}
        q={q ?? ""}
      />

      {!q && totalPages > 1 && (
        <CoursePagination
          buildHref={(p) => {
            const params = new URLSearchParams();
            if (currentCategory) params.set("category", currentCategory);
            if (p > 1) params.set("page", String(p));
            const qs = params.toString();
            return `/dashboard/browse${qs ? `?${qs}` : ""}`;
          }}
          currentPage={safePage}
          totalPages={totalPages}
        />
      )}
    </div>
  );
};

export default BrowseCoursesPage;
```

- [ ] **Step 3: Verify**

```bash
pnpm typecheck && pnpm check
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/requests/search/ app/dashboard/browse/page.tsx
git commit -m "feat: use semantic search on browse page when query is present"
```

---

## Task 9: Dashboard recommendations rail

**Files:**
- Create: `app/_components/Dashboard/components/RecommendedRail/index.tsx`
- Modify: `app/dashboard/page.tsx`

- [ ] **Step 1: Create the RecommendedRail component**

Create `app/_components/Dashboard/components/RecommendedRail/index.tsx`:

```tsx
import type { PublishedCourse } from "@/lib/requests/course/getPublishedCourses";
import BrowseCourseCard from "@/app/_components/Course/components/BrowseCourses/components/BrowseCourseCard";

type Props = {
  courses: PublishedCourse[];
};

const RecommendedRail = ({ courses }: Props) => {
  if (courses.length === 0) return null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-xl">Recommended for you</h2>
        <p className="text-muted-foreground text-sm">
          Based on your enrolled courses
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {courses.map((course) => (
          <BrowseCourseCard
            key={course.id}
            course={course}
            isEnrolled={false}
            nextLessonId={null}
          />
        ))}
      </div>
    </div>
  );
};

export default RecommendedRail;
```

- [ ] **Step 2: Update dashboard page to fetch and render recommendations**

Replace `app/dashboard/page.tsx` with:

```tsx
import { Award, BookOpen, Clock, TrendingUp } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/_components/_shared/ui/card";
import RecommendedRail from "@/app/_components/Dashboard/components/RecommendedRail";
import { api } from "@/trpc/server";

export default async function DashboardPage() {
  let recommendations: Awaited<ReturnType<typeof api.search.recommendations>> =
    [];
  try {
    recommendations = (await api.search.recommendations()) ?? [];
  } catch {
    // recommendations are non-critical; fail silently
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-3xl">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back! Here's your learning progress
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">
              Enrolled Courses
            </CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">12</div>
            <p className="text-muted-foreground text-xs">+2 from last month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Hours Learned</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">48.5</div>
            <p className="text-muted-foreground text-xs">
              +12.5 from last week
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Certificates</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">5</div>
            <p className="text-muted-foreground text-xs">+1 this month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">
              Completion Rate
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">87%</div>
            <p className="text-muted-foreground text-xs">+5% from last month</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Continue Learning</CardTitle>
          <CardDescription>Pick up where you left off</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              {
                title: "Advanced React Patterns",
                progress: 65,
                lesson: "Lesson 8: Custom Hooks",
              },
              {
                title: "TypeScript Fundamentals",
                progress: 42,
                lesson: "Lesson 5: Generics",
              },
              {
                title: "UI/UX Design Principles",
                progress: 88,
                lesson: "Lesson 12: Prototyping",
              },
            ].map((course) => (
              <div className="space-y-2" key={course.title}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{course.title}</p>
                    <p className="text-muted-foreground text-sm">
                      {course.lesson}
                    </p>
                  </div>
                  <span className="font-medium text-sm">{course.progress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${course.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <RecommendedRail courses={recommendations} />
    </div>
  );
}
```

- [ ] **Step 3: Verify**

```bash
pnpm typecheck && pnpm check
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/_components/Dashboard/ app/dashboard/page.tsx
git commit -m "feat: add recommended rail to student dashboard"
```

---

## Self-review spec coverage check

| Spec requirement | Task |
|---|---|
| `CourseEmbedding`, `LessonChunkEmbedding`, `UserInterestEmbedding` models | Task 1 |
| `CREATE EXTENSION IF NOT EXISTS vector` + IVFFlat indexes | Task 1 |
| `EmbeddingsService.embedCourse/embedLessonChunks/embedQuery/recomputeUserInterest` | Task 3 |
| `EmbeddingRepository` raw SQL helpers | Task 2 |
| LCEL `RunnableSequence` search chain with LangSmith tracing | Task 4 |
| `RecommendationsService.forUser` (centroid → exclude enrolled → hydrate) | Task 4 |
| `search.semantic` tRPC procedure | Task 5 |
| `search.recommendations` tRPC procedure | Task 5 |
| Hook: course publish/embeddable-field update → `embedCourse` | Task 6 |
| Hook: lesson content save → `embedLessonChunks` | Task 6 |
| Hook: enroll/re-activate → `recomputeUserInterest` | Task 6 |
| `pnpm reindex` backfill script | Task 7 |
| Browse page uses `search.semantic` when `q` present | Task 8 |
| Pagination hidden when semantic search active | Task 8 |
| Dashboard "Recommended for you" rail (hidden when < 3 results) | Task 9 |
| Rail uses existing `BrowseCourseCard` | Task 9 |