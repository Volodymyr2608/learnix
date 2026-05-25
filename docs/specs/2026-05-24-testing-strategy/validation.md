# Testing Strategy — Validation

## Automated checks

| # | Command | Expected result |
|---|---------|-----------------|
| A1 | `pnpm test:unit` | All unit tests pass; no DB/network access; runs in seconds. |
| A2 | `dotenv -e .env.test -- pnpm prisma migrate deploy` | Schema (incl. pgvector) applied to `learnix_test` with no error. |
| A3 | `pnpm test:integration` | All integration tests pass against `learnix_test`; tables truncated between tests. |
| A4 | `pnpm test` | Both projects run; exit 0. |
| A5 | `pnpm coverage` | Coverage report generated; critical-path services show non-zero coverage. |
| A6 | `pnpm typecheck` | No type errors introduced by test files or config. |
| A7 | `pnpm check` | Biome clean on new files. |
| A8 | `pnpm eval` | Runs every registered eval; prints an accuracy line per eval; exits non-zero if any below threshold. |
| A9 | `pnpm eval courseAI:classifyIntent` | Single eval still runs unchanged. |
| A10 | `pnpm eval quizAI:generation` / `learningPathAI:path` | New evals run and print accuracy. |

## CI verification

| # | Scenario | Expected result |
|---|----------|-----------------|
| C1 | Open a PR | `quality` and `integration` jobs both trigger. |
| C2 | PR with a deliberately failing unit test | `quality` job fails; merge check is red. |
| C3 | PR with a failing integration test | `integration` job fails; merge check is red. |
| C4 | pgvector migration in CI | `prisma migrate deploy` succeeds against the `pgvector/pgvector:pg17` service container. |
| C5 | Green PR merged to `main` | Vercel deploy proceeds; CI does not run inside the Vercel build. |

## Manual test scenarios

1. **Truncation safety guard**: point `.env.test` `DATABASE_URL` at a non-`learnix_test` name and run `pnpm test:integration` → setup throws before any truncation (protects dev/prod data).
2. **Enrollment own-course rule**: integration test asserts enrolling in your own course throws `EnrollmentError` with code `BAD_REQUEST`.
3. **Enrollment re-activation**: cancel an enrollment, re-enroll, assert status returns to `active` and no duplicate row created.
4. **Embedding hook isolation**: confirm enrollment/course tests do not make real OpenAI calls (embedding service is spied/stubbed) — run with no `OPENAI_API_KEY` set and tests still pass.
5. **Certificate token**: a tampered certificate token fails verification; a valid one round-trips.
6. **Role guard**: a student-context caller is rejected by an `instructorProcedure`; an instructor-context caller succeeds.
7. **Eval orphans wired**: `tutor` and `lessonInsights` evals load their existing datasets and produce scores (previously had no runner).

## Definition of done

- All A-checks pass locally.
- CI workflow committed; C1–C5 confirmed on a test PR.
- Round-one unit + integration tests (FR-7 through FR-13) implemented and green.
- `pnpm eval` run-all works; orphaned datasets wired; quizAI + learningPathAI evals added (FR-18 through FR-21).
- ADR-018 and this spec committed.