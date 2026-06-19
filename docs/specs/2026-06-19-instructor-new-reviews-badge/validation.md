# Validation: Dynamic "New Reviews" Sidebar Badge

> Requirements in [`requirements.md`](./requirements.md) · design in [`spec.md`](./spec.md) · plan in [`plan.md`](./plan.md)

## Automated checks

- `pnpm typecheck` — clean.
- `pnpm check` — Biome lint + format clean.
- `pnpm test:unit` and `pnpm test:integration` — green (test DB migrated first, see Prereqs).

### Unit tests (`*.test.ts` — no DB, deps mocked)

- `InstructorService.getNewReviewsCount` (`server/services/instructor/instructor.service.test.ts`):
  reads `getReviewsLastViewedAt` and forwards it to `countNewByInstructor`; with a timestamp →
  passes that `Date`; with `null` → passes `null`; returns the repository's number.
- `InstructorService.markReviewsViewed`: calls `touchReviewsViewed(instructorId)` and returns
  `{ success: true }`.

### Integration tests (`*.integration.test.ts` — `learnix_test`)

- `countNewByInstructor` (`server/repositories/courseReview.repository.integration.test.ts`):
  counts only the instructor's non-deleted reviews on non-deleted courses with `createdAt > since`;
  excludes another instructor's reviews; with `since = null` counts all the instructor's reviews.
- `getReviewsLastViewedAt` / `touchReviewsViewed`
  (`server/repositories/instructor.repository.integration.test.ts`): reads back the stored timestamp
  (or null); `touchReviewsViewed` sets it to ~now.

## Traceability (every requirement is covered)

| Requirement | Covered by |
|-------------|-----------|
| FR1 Badge shows new-review count | `countNewByInstructor` IT · `getNewReviewsCount` UT · Manual #1 |
| FR2 `9+` for large counts | Manual #2 (`formatBadge`) |
| FR3 Non-instructors see no badge | Manual #5 |
| FR4 No hardcoded `"5"` | Code review + Manual #1 (count reflects data) |
| FR5 Clear on open (no hard reload) | Manual #3 |
| FR6 Cleared state persists | Manual #3 (reload step) |
| FR7 Idempotent / safe with zero reviews | `markReviewsViewed` UT · Manual #4 |
| FR8 New column persists | `instructor.repository` IT · migration applied |
| FR9 Backfill existing instructors | Manual #6 (post-migrate existing instructor) |
| FR10 Null-safe count | `countNewByInstructor` IT (`since = null`) · `getNewReviewsCount` UT |

## Manual test scenarios

Prereqs:
```bash
docker-compose up -d
pnpm db:migrate && pnpm generate                       # dev DB + client
pnpm exec dotenv -e .env.test -- prisma migrate deploy # test DB (for integration tests)
pnpm dev
# Accounts: an instructor who owns ≥1 published course with enrolled students who can review;
# a second instructor; a student account.
```

1. **Badge shows real count:** as a student enrolled in the instructor's course, leave a new review.
   As the instructor (sidebar already loaded before the review, or after a reload), the Reviews nav
   item shows a badge equal to the number of reviews left since the instructor last opened the
   Reviews page. → matches Prisma Studio (`pnpm db:studio`).
2. **`9+` cap:** with 10+ new reviews, the badge reads `9+`.
3. **Clear on open (no hard reload):** with a non-zero badge, click the Reviews nav item. → After
   the page loads the badge disappears **without** a manual browser refresh. Navigate to another
   instructor page and back, then hard-reload — the badge stays gone (timestamp persisted).
4. **Zero-state / idempotent:** as an instructor with no new reviews, open `/instructor/reviews`
   repeatedly. → No badge, no error; `reviews_last_viewed_at` advances each visit.
5. **Non-instructor:** sign in as a student. → No Reviews nav item and no reviews badge anywhere;
   confirm no `getNewReviewsCount` call is made for the student (network tab / server logs).
6. **Rollout backfill:** immediately after running the migration, an existing instructor with old
   reviews opens the portal. → No badge (their `reviews_last_viewed_at` was backfilled to migration
   time); a review created *after* migration then produces a badge of 1.

## Edge cases & regression

- **IDOR:** `getNewReviewsCount` / `markReviewsViewed` use `ctx.session.user.id` only; one
  instructor's badge never reflects another's reviews (verified by the per-instructor scoping in
  `countNewByInstructor` IT).
- **Review while on the page:** a review created while the instructor sits on `/instructor/reviews`
  does not bump the badge until the next visit (decision #4) — confirm it appears after navigating
  away and back.
- **Count-fetch failure:** if `getNewReviewsCount` throws, the request helper returns `0` → the
  sidebar renders with no badge, never a crash.
- **Mark-viewed failure:** if `markReviewsViewed` throws, the error is logged and the Reviews page
  still renders (badge simply won't clear that visit).
- **Soft-deleted** reviews/courses are excluded from the count.
- **Regression:** the existing reviews dashboard, instructor dashboard rating stat, and student
  review-create flow are untouched and still pass their tests; the Messages badge is unchanged.

## Definition of done

- [ ] All automated checks green; new logic covered by unit (service) + integration (both repos).
- [ ] Every FR in `requirements.md` traces to a passing check above.
- [ ] All manual scenarios pass, including clear-on-open with no hard reload (FR5) and the rollout
      backfill (FR9).
- [ ] Risks in `spec.md` (badge not clearing, missed backfill) are mitigated.
- [ ] Docs updated where warranted (CLAUDE.md instructor router note); no ADR needed.