# Validation: Lesson Auto-Summary & Study Guide

## Automated checks

| Command | Expectation |
|---|---|
| `pnpm typecheck` | No errors. |
| `pnpm check` | No lint or format issues. |
| `pnpm db:generate` | Migration generated for `LessonInsights`. |
| `pnpm build` | Production build succeeds. |
| `pnpm eval` (after dataset is added) | All 10 dataset items score above the threshold. |

## Manual scenarios

Run `pnpm dev`. Sign in as INSTRUCTOR with at least one published course containing a lesson with non-empty `content`.

### S1 — First generation

1. Open the lesson edit page.
2. **Verify**: "Generate study guide" button is enabled; no "last generated" badge yet.
3. Click the button.
4. **Verify**: button enters a loading state; within ~10 seconds, the toolbar updates with a `Last generated · just now` timestamp.
5. **Verify** in Prisma Studio: a `LessonInsights` row exists for the lesson with non-empty `summary`, `concepts` (3–7 items), `glossary` (any number including zero), `contentHash`, and `model = "gpt-4o-mini"`.

### S2 — Cache hit on unchanged content

1. Click "Generate study guide" again immediately.
2. **Verify**: response returns within ~200 ms (no LLM round-trip).
3. **Verify**: `generatedAt` does NOT change (no upsert ran).

### S3 — Stale badge after content edit

1. Edit the lesson `content` and save.
2. **Verify**: the "Content changed" badge appears next to the generate button.
3. Click "Generate study guide".
4. **Verify**: the badge disappears; `generatedAt` advances; `contentHash` matches the new content.

### S4 — Empty content rejection

1. Open a lesson with `content` empty or whitespace-only.
2. Click "Generate study guide".
3. **Verify**: a clear error toast appears (e.g., "This lesson has no content to summarise").
4. **Verify** in Prisma Studio: no `LessonInsights` row was created.

### S5 — Permission gate

1. Sign in as a different INSTRUCTOR who does not own this course.
2. Attempt the mutation via tRPC devtools.
3. **Verify**: response is `FORBIDDEN`.

### S6 — Student view

1. Sign in as a STUDENT enrolled in the course.
2. Open the lesson.
3. **Verify**: the StudyGuideCard renders with three collapsible sections.
4. Open a lesson that has no `LessonInsights` row.
5. **Verify**: no card appears (silent absence, not an empty state).

### S7 — Parallel execution visible

1. With `LANGSMITH_TRACING=true`, generate insights for a fresh lesson.
2. **Verify** in LangSmith UI: the trace shows three child spans (`summaryChain`, `conceptsChain`, `glossaryChain`) starting within a few ms of each other.

### S8 — Failure rolls back cleanly

1. Temporarily set `OPENAI_API_KEY` to an invalid value.
2. Click "Generate study guide".
3. **Verify**: error toast; no partial `LessonInsights` row created.
4. Restore the key and retry; succeeds normally.
