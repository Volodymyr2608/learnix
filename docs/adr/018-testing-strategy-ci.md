# ADR-018: Testing Strategy and CI Gating

- **Status**: Accepted
- **Date**: 2026-05

## Context

The codebase has shipped a substantial feature set (auth, enrollment, course management, AI builder, semantic search) with **no automated unit or integration tests** and no CI gating. Correctness is currently verified by hand, typecheck, and Biome. This does not scale:

- Core business logic (enrollment rules, course publishing, progress math, certificate token signing, role enforcement) can regress silently — typecheck and lint do not catch behavioural bugs.
- The three-layer architecture (routers → services → repositories, ADR-003) concentrates business rules in services, but those services import repository **singletons** directly (e.g. `import { courseRepository }`) rather than receiving them via dependency injection. There is no test harness to exercise them.
- AI features already have offline evals (ADR-013) under `evals/`, but `pnpm eval` requires a name argument, has no run-all mode, and two datasets (`tutor`, `lessonInsights`) are orphaned with no runner. Two AI features (quizAI, learningPathAI) have no evals at all.
- Deployment is on Vercel with no quality gate; any merge to `main` deploys regardless of whether the change is correct.

We need a layered test strategy that matches the architecture, runs cheaply on every PR, and gates deployment — without slowing the Vercel build or sending test traffic through a paid LLM on every commit.

## Decision

Adopt a three-layer testing strategy (unit → integration → offline evals) with **Vitest** as the runner, real-Postgres integration tests, and **GitHub Actions as the deploy gate**. Evals remain offline and non-blocking per ADR-013.

### The testing pyramid

| Layer | Targets | Database | Speed / count |
|-------|---------|----------|---------------|
| **Unit** | `lib/utils`, `lib/guards`, AI validators (`quizAI.validator`, courseAI validators), pure courseAI graph nodes, service-level pure helpers | none (mocked where needed) | many, milliseconds |
| **Integration** | services + repositories exercised together against the real schema: enrollment, course publish, progress, certificates, role-gated access | real Postgres | fewer, seconds |
| **Eval** (offline) | LLM output quality per AI feature | n/a (calls OpenAI) | manual, before prompt changes |

React component and end-to-end browser tests are **explicitly out of scope** for now (YAGNI). The goal is coverage of core logic and critical paths.

### Rules

1. **Vitest is the single runner** for unit and integration layers. Config lives in `vitest.workspace.ts` with two projects: `unit` (node env, no DB) and `integration` (loads `.env.test`, requires a database). No Jest.

2. **Unit tests are colocated** as `*.test.ts` next to their source; integration tests use the `*.integration.test.ts` suffix. Unit tests MUST NOT touch the network or a database — mock repository modules with `vi.mock` when a service helper must be unit-tested in isolation.

3. **Integration tests run against a real Postgres**, never mocks. Rationale: services bind to repository singletons that issue real Prisma / raw SQL (including pgvector `<=>` queries), so a mock would not exercise the code that actually breaks. A dedicated `learnix_test` database is used — locally via the docker-compose Postgres on 5433, in CI via a service container.

4. **Schema is applied with `prisma migrate deploy`** against the test database before integration tests run; tests isolate themselves by truncating tables (`TRUNCATE ... RESTART IDENTITY CASCADE`) between cases via a shared `test/db.ts` helper. Test data is built through `test/factories.ts`, not inline fixtures.

5. **CI is the deploy gate, not the Vercel build.** A GitHub Actions workflow (`.github/workflows/ci.yml`) runs `typecheck → biome → unit → integration` on every PR and push to `main`. These are **required status checks** on `main`. Vercel deploys `main` only after a gated merge. The Vercel build remains database-free and runs no tests.

6. **The CI Postgres uses a pgvector-capable image** (`pgvector/pgvector:pg17`) so `prisma migrate deploy` can run the `CREATE EXTENSION vector` migration (ADR-012). The service container is health-checked before tests start and discarded when the job ends.

7. **Evals stay offline and out of PR CI** (extends ADR-013 rule 7). `pnpm eval` gains a run-all mode (`pnpm eval` with no argument runs every registered eval and exits non-zero on any failure; `pnpm eval <name>` still runs one). Each AI feature owns one golden JSONL dataset and one judge with an accuracy threshold. Evals are run locally before merging prompt or chain changes, and the score is posted in the PR.

8. **Every AI feature has at least one eval.** This round wires the orphaned `tutor` and `lessonInsights` datasets into runners and adds evals for `quizAI` and `learningPathAI`, alongside the existing four `courseAI` node evals.

9. **New package scripts**: `test` (run all once), `test:unit`, `test:integration`, `test:watch`, `coverage`. `pnpm eval` is unchanged in name.

## Consequences

**Positive**
- Critical business rules gain a regression net; behavioural bugs fail a PR instead of reaching production.
- Real-DB integration tests catch the class of bugs (migration drift, raw SQL, pgvector) that mocks structurally cannot.
- The deploy gate lives in GitHub Actions, so the Vercel build stays fast and needs no database credentials.
- Establishes a colocated, factory-driven test pattern other contributors can copy for new services.
- Evals stay free per-PR while still being a required step for prompt changes.

**Negative / Trade-offs**
- Integration tests are slower than pure unit tests and need a running Postgres locally and a service container in CI — more setup than a mock-only suite.
- Because services use singletons rather than DI, isolating a single service in a pure unit test requires module mocking, which is more brittle than constructor injection. We accept this rather than refactoring every service for DI now; integration coverage compensates.
- A pgvector image and migration step add ~tens of seconds to CI runtime.
- Evals being non-blocking means a prompt regression can still merge if a contributor skips the manual eval run; this is a known gap (CI eval gating remains a future addition, as in ADR-013).