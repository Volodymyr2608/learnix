# Testing Strategy — Requirements

## Problem

The app has shipped auth, enrollment, course management, AI features, and semantic search with **zero automated unit or integration tests** and no CI gating. Correctness relies on manual checks, `tsc --noEmit`, and Biome — none of which catch behavioural regressions. Business rules concentrated in the service layer (ADR-003) can break silently, and any merge to `main` deploys to Vercel unguarded.

The existing AI evals (ADR-013) are partially broken: `pnpm eval` requires a name argument with no run-all mode, two datasets (`tutor`, `lessonInsights`) are orphaned with no runner, and `quizAI` / `learningPathAI` have no evals.

## Goal

Stand up a layered testing system and a CI deploy gate, and write a first round of tests covering critical core logic. Specifically:

1. A **unit + integration** test stack on **Vitest**, matching the testing pyramid to the router → service → repository architecture.
2. **Integration tests against a real Postgres** (`learnix_test`), locally and via a CI service container, exercising the highest-risk critical paths.
3. A **GitHub Actions CI workflow** that runs typecheck, lint, and tests on every PR and gates merges to `main` (Vercel deploys `main` only after merge — the Vercel build stays DB-free).
4. A **fixed and expanded eval suite**: `pnpm eval` run-all mode, orphaned datasets wired up, and new evals for `quizAI` and `learningPathAI`.

Out of scope (YAGNI): React component tests, end-to-end browser tests, CI eval gating. See ADR-018.

## Design decisions (from ADR-018)

- **Runner**: Vitest with a `vitest.workspace.ts` defining two projects — `unit` (node env, no DB) and `integration` (loads `.env.test`, real DB).
- **File conventions**: unit tests colocated as `*.test.ts`; integration tests as `*.integration.test.ts`.
- **DB strategy**: services bind to repository singletons that hit the real `db` (`server/db.ts`, driven by `DATABASE_URL`). Integration tests point `DATABASE_URL` at `learnix_test`, apply schema with `prisma migrate deploy`, and truncate between tests. No DI refactor.
- **Evals**: stay offline, non-blocking, run before prompt changes.

## Functional Requirements

### Test infrastructure

- FR-1. Vitest SHALL be installed with a workspace exposing `unit` and `integration` projects.
- FR-2. Package scripts SHALL exist: `test`, `test:unit`, `test:integration`, `test:watch`, `coverage`. `pnpm eval` SHALL remain.
- FR-3. A `test/db.ts` helper SHALL export a test Prisma client and a `truncateAll()` that runs `TRUNCATE ... RESTART IDENTITY CASCADE` across all app tables.
- FR-4. A `test/factories.ts` helper SHALL provide builders for `User` (per role), `Course`, `Section`, `Lesson`, `Enrollment` to construct test data without inline fixtures.
- FR-5. Integration project setup SHALL load `.env.test` and SHALL fail fast if `DATABASE_URL` points at a non-test database name (guard against truncating dev/prod data).
- FR-6. Unit tests SHALL NOT open a network or DB connection; service helpers needing isolation SHALL mock repository modules via `vi.mock`.

### Unit coverage (round one)

- FR-7. Unit tests SHALL cover `lib/utils` (`capitalize`, `generateListWithIds`, `doesPasswordMatch`, date utils) and `lib/guards/isAbortError`.
- FR-8. Unit tests SHALL cover `quizAI.validator` and the courseAI validators (curriculum/step validation pure functions).

### Integration coverage (round one — critical paths)

- FR-9. `EnrollmentService.enrollInCourse` SHALL be tested for: successful enrollment, own-course rejection, re-activation of a cancelled enrollment, and that a user-interest recompute is triggered (the embedding call may be stubbed at its boundary).
- FR-10. `CourseService` publish flow SHALL be tested: status transition to `published` and that the publish embedding hook fires (boundary stubbed).
- FR-11. `CourseProgressService` SHALL be tested for progress calculation across lesson completion.
- FR-12. `CertificateService` token signing/verification SHALL be tested round-trip (sign → verify → tampered token rejected).
- FR-13. Role-gated access SHALL be tested: a `studentProcedure`/`instructorProcedure`/`adminProcedure` rejects the wrong role and accepts the right one (via the tRPC caller or the guard layer).

### CI / deploy gate

- FR-14. `.github/workflows/ci.yml` SHALL run on PRs and pushes to `main` with jobs: `typecheck`, `lint` (biome), `unit`, `integration`.
- FR-15. The `integration` job SHALL declare a `pgvector/pgvector:pg17` service container, run `prisma migrate deploy` against it, then `pnpm test:integration`.
- FR-16. CI SHALL be configured as required status checks on `main` (documented; branch protection is a repo setting).
- FR-17. The Vercel build SHALL remain unchanged (no tests, no test DB).

### Evals

- FR-18. `pnpm eval` with no argument SHALL run every registered eval sequentially and exit non-zero if any fails; `pnpm eval <name>` SHALL still run a single eval.
- FR-19. The orphaned `tutor` (lessonAI) and `lessonInsights` datasets SHALL be wired into runner functions registered in `runEvals.ts`.
- FR-20. New evals SHALL be added for `quizAI` and `learningPathAI`, each with a golden JSONL dataset under `evals/datasets/` and a judge with an accuracy threshold.
- FR-21. Shared eval scoring/threshold logic SHALL live in `evals/_shared/`, and the dead `void evaluate` line SHALL be removed.

## Affected / new files

**New**
- `vitest.workspace.ts`, `vitest.config.ts` (or per-project configs)
- `.env.test` (gitignored) + `.env.test.example`
- `test/db.ts`, `test/factories.ts`, `test/setup.integration.ts`
- `.github/workflows/ci.yml`
- `evals/_shared/score.ts`, `evals/lessonAI/tutor.eval.ts`, `evals/lessonInsightsAI/lessonInsights.eval.ts`, `evals/quizAI/quizGeneration.eval.ts`, `evals/learningPathAI/learningPath.eval.ts`
- `evals/datasets/quizAI/*.jsonl`, `evals/datasets/learningPathAI/*.jsonl`
- `*.test.ts` colocated with `lib/utils/*`, `lib/guards/*`, AI validators
- `*.integration.test.ts` for enrollment, course, progress, certificate, role guards

**Modified**
- `package.json` (scripts + devDependencies)
- `evals/runEvals.ts` (run-all mode, new registrations, remove dead code)
- `.gitignore` (add `.env.test`)
- `docker-compose.yml` (optional: declare/seed `learnix_test` DB) — or document manual `createdb`

## Non-goals

- No dependency-injection refactor of services.
- No React component or Playwright E2E tests.
- No eval execution inside PR CI.