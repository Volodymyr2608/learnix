# Validation: Personalized Learning Path Agent

## Automated checks

| Command | Expectation |
|---|---|
| `pnpm typecheck` | No errors. |
| `pnpm check` | No lint or format issues. |
| `pnpm build` | Production build succeeds. |
| `pnpm db:generate` | Migration applies cleanly to an empty DB. |

## Manual scenarios

Run `pnpm dev`. Sign in as STUDENT enrolled in a published course with: at least 2 completed lessons, at least 1 failed quiz attempt, and at least 1 `ConceptMastery` row with `level < 3`. Seed if necessary.

### S1 — First-time empty state

1. Sign in as a STUDENT who has just enrolled in a course (no lessons completed, no quiz attempts).
2. Open the course player page.
3. **Verify**: `LearningPathCard` shows `EmptyStateCard` ("Get your personalised path") with a single CTA button.
4. Click the button.
5. **Verify**: a short loading state, then a card appears with 3 `NEW_LESSON` steps using the first 3 lessons in the course `order`. Each reason is canned (no LLM call).
6. **Verify** in server log: no OpenAI request was made. LangSmith trace shows `skipLLM=true`.

### S2 — Generate path with mixed actions

1. Sign in as the seeded student (S1 prerequisites met).
2. Click "Regenerate".
3. **Verify**: SSE progress strings appear ("Analyzing your progress…", "Picking next lessons…", "Writing reasoning…").
4. **Verify**: 3–5 steps appear, with a mix of types. At least one `REVIEW_LESSON` or `RETRY_QUIZ` should be present given the seed.
5. **Verify**: each step has a `reason` ≥ 20 chars, grounded in the student's data (mentions the weak concept or a specific quiz).
6. **Verify**: the `summary` is non-empty; the `weakConcepts` chips list at least one concept.

### S3 — Step deep links

1. Continuing from S2.
2. Click a `NEW_LESSON` row.
3. **Verify**: navigation to the lesson page.
4. Click a `REVIEW_LESSON` row (back in the path card).
5. **Verify**: navigation to the lesson page; URL contains no `?action=` flag (review = same lesson).
6. Click a `RETRY_QUIZ` row.
7. **Verify**: navigation to the lesson with the quiz scrolled into view.

### S4 — Cache invalidation on quiz attempt

1. With a generated, non-stale path visible.
2. Submit a quiz answer on a lesson in the same course.
3. Reload the course page.
4. **Verify**: the `StaleBanner` is now visible. `staleAt` in `learning_path_cache` is non-null.
5. Click "Regenerate"; **verify** the banner disappears and the path content updates (or stays the same — both are acceptable; just that it re-ran).

### S5 — Cache invalidation on lesson complete

1. With a generated, non-stale path visible.
2. Mark a lesson complete from the lesson page.
3. Return to the course page.
4. **Verify** the `StaleBanner` appears.
5. **Verify** in DB: `learning_path_cache.staleAt` is non-null.

### S6 — Cache invalidation on lesson incomplete

1. From S5, mark the just-completed lesson incomplete.
2. **Verify**: a fresh `markStale` write occurred (timestamp updated).

### S7 — Rate limiting

1. With a path visible, click "Regenerate".
2. Without waiting, click "Regenerate" again within 60s.
3. **Verify**: tRPC error `TOO_MANY_REQUESTS` is shown in the UI; the button shows a countdown until the next allowed attempt.

### S8 — Cross-student isolation

1. Sign in as Student A; generate a path.
2. Sign in as Student B (same course); generate a path.
3. **Verify**: each gets their own row in `learning_path_cache`; the contents differ if their progress differs.
4. Manually craft a tRPC `learningPath.getForCourse` call with Student B's courseId from Student A's session.
5. **Verify**: A's cache row is returned (scoped by `ctx.session.user.id`), not B's.

### S9 — Course unavailable

1. As INSTRUCTOR, unpublish a course (or soft-delete it).
2. As an enrolled STUDENT for that course, click "Regenerate".
3. **Verify**: tRPC returns the mapped `CourseUnavailableError` → user-friendly error toast.

### S10 — OpenAI transient failure

1. Temporarily set `OPENAI_API_KEY` to an invalid value (or block egress in test env).
2. With a pre-existing cache row, click "Regenerate".
3. **Verify**: the existing cache is still returned by `getForCourse`; the regenerate call surfaces a recoverable error toast ("We couldn't refresh — showing the last path").
4. Restore the key and click "Regenerate" again; **verify** a fresh path is produced.

### S11 — Semantic violation retry

1. Temporarily modify `mergeAndExplain` to return a step where `NEW_LESSON.lessonId` is in `completedLessonIds` (simulate model error).
2. Click "Regenerate".
3. **Verify** in server log: attempt 1 produced a violation; attempt 2 succeeded.
4. Restore the function.

### S12 — Reflection loop

1. With a generated path, inspect LangSmith trace.
2. **Verify**: a `reflectAndCheck` span exists. If it suggested feedback, a second `mergeAndExplain` span follows. Max 2 reflection attempts; on the 3rd attempt the final-steps from the previous merge are used as-is.

### S13 — LangSmith tracing

1. With `LANGSMITH_TRACING=true`, regenerate a path.
2. **Verify** in LangSmith UI: a run named `learning-path` with tag `feature:learning-path`, `studentId:<id>` and `courseId:<id>` in metadata.
3. **Verify**: child spans for each graph node; the `mergeAndExplain` span shows the tool calls as nested children when tools were used.

### S14 — UI: collapsed / expanded states

1. With a 5-step path, the card initially shows summary + first step + "Show all".
2. Click "Show all".
3. **Verify** all steps render.
4. Reload — **verify** the collapsed state persists (or doesn't — either UX is acceptable as long as it's consistent).

### S15 — Authorization

| Action | Role | Expected |
|---|---|---|
| `learningPath.getForCourse` | anonymous | `UNAUTHORIZED` |
| `learningPath.getForCourse` | INSTRUCTOR (not enrolled) | `FORBIDDEN` (studentProcedure) |
| `learningPath.regenerate` for a course the student is not enrolled in | STUDENT | `CourseUnavailableError` → `BAD_REQUEST` |
| `learningPath.regenerate` with empty courseId | STUDENT | `BAD_REQUEST` (Zod) |