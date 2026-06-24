---
feature: semantic-search-recommendations
status: stable
models: [CourseEmbedding, LessonChunkEmbedding, UserInterestEmbedding]
depends-on: [course, enrollment]
---

## Purpose

Keyword (`LIKE`) search misses courses described in different words than the query, and students have
no way to discover relevant courses they haven't searched for — pgvector cosine search and a per-user
interest vector solve both (ADR-012).

## Functional scope

- `search.semantic` (studentProcedure) embeds the query (`text-embedding-3-small`) and returns
  cosine-ranked published courses, with optional `category`/`level` filters.
- `search.recommendations` (studentProcedure) returns a personalized course list from the student's
  interest vector — the centroid of their enrolled courses' embeddings — excluding already-enrolled
  courses. Returns `[]` below 3 results rather than padding with weak matches.
- Embeddings are kept fresh by fire-and-forget hooks, not a batch job: `CourseService.updateCourse`
  re-embeds on publish or on title/subtitle/description/objectives change to an already-published
  course; `LessonService.updateLessonContent` re-chunks and re-embeds lesson content;
  `EnrollmentService.enrollInCourse` recomputes the student's interest centroid on every new or
  reactivated enrollment.
- `app/dashboard/browse/page.tsx` switches to semantic results when `?q=` is present (pagination
  hidden for semantic results); the dashboard's "Recommended for you" rail
  (`RecommendedRail`) is silently omitted when recommendations return fewer than 3 courses.
- `pnpm reindex` (`scripts/reindex-embeddings.ts`) backfills all published courses, lessons with
  content, and enrolled users' interest vectors — for bootstrapping or after a model/dimension change.

## Acceptance criteria

- Searching a phrase that doesn't literally appear in any course title/description still surfaces
  topically related published courses.
- A student with fewer than 3 enrollments (and therefore a thin interest signal) sees no
  "Recommended for you" rail rather than a low-confidence one.
- Publishing edits to a course's description updates its search ranking without a manual reindex.

## Agent notes

- All embedding reads/writes go through `EmbeddingRepository` (`server/repositories/embedding.repository.ts`)
  as raw SQL (`$queryRaw`/`$executeRaw`) — Prisma's query builder doesn't support the `<=>` cosine
  operator or `vector` column type.
- `SearchService` is an LCEL `RunnableSequence` (embed → search → hydrate), wrapped in LangSmith
  `traced` — keep that wrapping when modifying the chain so tracing doesn't silently break.
- Embedding hook failures are `.catch`-logged and never block the triggering mutation (course save,
  lesson save, enrollment) — don't make them awaited/blocking.
- See ADR-012 for why pgvector over a dedicated vector DB.