# Validation: Semantic Search & Course Recommendations

## Automated checks

| Command | Expectation |
|---|---|
| `pnpm typecheck` | No errors. |
| `pnpm check` | No lint or format issues. |
| `pnpm db:generate` | Migration generated for `CourseEmbedding`, `LessonChunkEmbedding`, `UserInterestEmbedding`. |
| `pnpm db:migrate` | Extension and indexes created without error. |
| `pnpm reindex` | Completes against a seeded dev DB; row counts in the three embedding tables match expectations. |
| `pnpm build` | Production build succeeds. |

## Manual scenarios

Run `pnpm dev`. Sign in as STUDENT.

### S1 — Search by intent, not keyword

1. Seed dev DB so a "Build LLM-powered apps with Python" course exists. Confirm none of its title words are "chatbot".
2. Visit `/dashboard/browse`.
3. Search `build a chatbot`.
4. **Verify**: the LLM/Python course appears in the top results.
5. Apply category filter Programming.
6. **Verify**: results are filtered AND still ordered by semantic similarity.

### S2 — Recommendations rail

1. Enroll in two AI-themed courses, then visit `/dashboard`.
2. **Verify**: a "Recommended for you" rail renders with at least three courses, none of which are courses you are enrolled in.
3. Cancel one enrollment.
4. Refresh the dashboard.
5. **Verify**: rail order changes (centroid was recomputed).

### S3 — Empty state

1. As a fresh STUDENT with zero enrollments, visit `/dashboard`.
2. **Verify**: rail is hidden (no centroid yet).
3. Enroll in one course; refresh.
4. **Verify**: rail appears.

### S4 — Indexing on publish & save

1. Sign in as INSTRUCTOR. Create a new course; do NOT publish.
2. **Verify** in Prisma Studio: no `CourseEmbedding` row exists for this course.
3. Publish the course.
4. **Verify**: a `CourseEmbedding` row appears within ~5 seconds.
5. Edit the course's description; save.
6. **Verify**: `updatedAt` on the embedding moves forward.
7. Edit a lesson's `content`; save.
8. **Verify**: `LessonChunkEmbedding` rows for that lesson are replaced (count may change).

### S5 — Index is used

1. Run `EXPLAIN ANALYZE SELECT id FROM "CourseEmbedding" ORDER BY embedding <=> '[…]'::vector LIMIT 20;` in `pnpm db:studio` SQL console.
2. **Verify** the plan includes `Index Scan using course_embedding_cosine_idx`.

### S6 — Failure mode does not block writes

1. Set `OPENAI_API_KEY` to a clearly-invalid value.
2. As INSTRUCTOR, save a lesson's content.
3. **Verify**: lesson save succeeds.
4. **Verify** the server log shows an embedding error.
5. Restore the key. Edit and save the lesson again.
6. **Verify**: chunks are re-embedded.

### S7 — LangSmith tracing (only if `LANGSMITH_TRACING=true`)

1. Issue a search query.
2. **Verify** in LangSmith UI: a run named `search.semantic` with tag `feature:search` is logged with the LCEL chain steps visible.
