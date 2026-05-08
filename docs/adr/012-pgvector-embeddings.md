# ADR-012: pgvector for Embeddings and Semantic Retrieval

- **Status**: Accepted
- **Date**: 2026-05

## Context

Two upcoming features require vector similarity search:

1. **Semantic course search & recommendations** — replace `title LIKE '%q%'` (`course.repository.ts::getPublishedCourses`) with intent-aware retrieval over course title + subtitle + description + objectives.
2. **AI Course Tutor RAG tools** — the lesson assistant agent (extends ADR-008) needs to retrieve relevant lesson chunks and pull cross-lesson context. Pre-loading the full lesson `content` into the prompt is wasteful and breaks for long lessons.

The platform already runs Postgres on docker-compose port 5433. Adding a managed vector DB (Pinecone, Qdrant Cloud) would mean a second data store, a second auth surface, additional env vars, and a second cost line item — overkill for the current scale.

## Decision

Use the **`pgvector`** Postgres extension on the existing database for all embedding storage and similarity search.

### Rules

1. **One extension migration.** A single migration runs `CREATE EXTENSION IF NOT EXISTS vector;`. All embedding tables follow.
2. **Embeddings are typed `vector(1536)`.** Schema declares them via Prisma's `Unsupported("vector(1536)")` since Prisma has no native vector type yet. Similarity queries use raw SQL through `db.$queryRaw`.
3. **Embedding model: `text-embedding-3-small`** (OpenAI, 1536 dimensions, $0.02 / 1M tokens). One model across all embedding tables so cosine distances are comparable.
4. **One table per embedding owner**, with a unique index on the foreign key:
   - `CourseEmbedding` — one row per published course.
   - `LessonChunkEmbedding` — many rows per lesson (chunked text body), indexed by lesson + chunk index.
   - `UserInterestEmbedding` — one row per student, recomputed when enrollments change.
5. **IVFFlat index** with `lists = 100` and `vector_cosine_ops`. Tuned for our row counts; revisit when any single table exceeds ~1M rows.
6. **Indexing is event-driven.** A course's `publishedAt` transition or lesson `content` mutation enqueues a re-embed. A `pnpm reindex` script does a full rebuild for backfill or after the embedding model is changed.
7. **Cosine distance only.** All queries use the `<=>` operator. No mixing with L2 / inner-product.
8. **Embeddings live next to relational data.** The repository layer (`embedding.repository.ts`) wraps raw SQL so callers stay in the existing repository pattern (ADR-003).

## Consequences

**Positive**
- No new infrastructure, no new env vars, no new vendor. `docker compose up` still gives a fully working dev environment.
- Joins are cheap: filter by `Course.published = true` and rank by vector distance in one query.
- Backups, replication, and access control reuse the existing Postgres setup.
- Fits the embedding scale of a learning platform (courses + lesson chunks); IVFFlat handles millions of rows comfortably.

**Negative / Trade-offs**
- Prisma's `Unsupported("vector")` type means similarity queries cannot be expressed through the Prisma query builder; raw SQL is required for vector predicates.
- Vector index tuning (`lists`, `probes`) is a manual ongoing concern as data grows.
- Postgres CPU spikes during large reindex jobs; backfill is gated to off-peak via the script-driven approach (no inline embedding on hot paths beyond the single row being saved).
- If a future feature needs ANN at very large scale (>10M vectors), this decision will be revisited in favor of a dedicated store.
