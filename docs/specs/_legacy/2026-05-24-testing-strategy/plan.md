# Testing Strategy — Implementation Plan

Implementation order is bottom-up: install the runner, build the harness, write unit tests (no DB), then integration tests (real DB), then CI, then evals. Each step is independently verifiable.

## Step 1 — Install Vitest and scripts

- Add devDeps: `vitest`, `@vitest/coverage-v8`, `vite-tsconfig-paths` (to resolve the `@/` alias).
- `vitest.workspace.ts`:
  ```ts
  import { defineWorkspace } from "vitest/config";
  export default defineWorkspace([
    { extends: "./vitest.config.ts", test: { name: "unit", environment: "node", include: ["**/*.test.ts"], exclude: ["**/*.integration.test.ts", "node_modules"] } },
    { extends: "./vitest.config.ts", test: { name: "integration", environment: "node", include: ["**/*.integration.test.ts"], setupFiles: ["./test/setup.integration.ts"], fileParallelism: false } },
  ]);
  ```
- `vitest.config.ts`: `plugins: [tsconfigPaths()]`, coverage provider `v8`.
- `package.json` scripts:
  ```json
  "test": "vitest run",
  "test:unit": "vitest run --project unit",
  "test:integration": "dotenv -e .env.test -- vitest run --project integration",
  "test:watch": "vitest",
  "coverage": "vitest run --coverage"
  ```
  (use `tsx`/`dotenv-cli` consistent with existing `--env-file` usage; or load `.env.test` inside the setup file).

**Verify**: `pnpm test:unit` runs and reports "no tests found" cleanly.

## Step 2 — Test harness (DB + factories)

- `.env.test.example` with `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/learnix_test`; add `.env.test` to `.gitignore`.
- `test/setup.integration.ts`: load `.env.test`; assert `DATABASE_URL` contains `learnix_test` (throw otherwise — FR-5); export nothing, just side-effect env load + a global `beforeEach(truncateAll)`.
- `test/db.ts`: instantiate a `PrismaClient` from `@/generated/prisma`; `truncateAll()` queries `information_schema` (or a hardcoded table list) and runs one `TRUNCATE <tables> RESTART IDENTITY CASCADE`.
- `test/factories.ts`: `makeUser({ role })`, `makeCourse({ instructorId, status })`, `makeSection`, `makeLesson`, `makeEnrollment` — each inserts via the test client and returns the row.
- Local DB bootstrap: document `docker compose exec db createdb -U postgres learnix_test` (or add to docker-compose), then `dotenv -e .env.test -- pnpm prisma migrate deploy`.

**Verify**: a throwaway `test/sanity.integration.test.ts` that inserts a user via factory and reads it back passes; truncation leaves the table empty for the next test.

## Step 3 — Unit tests (no DB)

Colocate `*.test.ts`:
- `lib/utils/capitalize.test.ts`, `generateListWithIds.test.ts`, `doesPasswordMatch.test.ts`, date utils.
- `lib/guards/isAbortError.test.ts`.
- `server/services/quizAI/quizAI.validator.test.ts` — valid quiz passes, malformed (duplicate correct answers, missing options) rejected.
- courseAI validators — curriculum/step validation pure functions: valid input passes, missing-required fails with expected error shape.

**Verify**: `pnpm test:unit` green.

## Step 4 — Integration tests (critical paths)

Each file imports the real service singleton; data built via factories; assertions on DB state and thrown `*.errors.ts` codes. Stub fire-and-forget embedding/email calls at their module boundary with `vi.mock` so tests don't call OpenAI.

- `server/services/enrollment/enrollment.integration.test.ts` (FR-9): enroll success; own-course → `BAD_REQUEST`; re-activate cancelled enrollment; `embeddingsService.recomputeUserInterest` invoked (spy).
- `server/services/course/course.integration.test.ts` (FR-10): publish transitions status; `embeddingsService.embedCourse` invoked on publish (spy).
- `server/services/.../courseProgress.integration.test.ts` (FR-11): completing lessons updates progress percentage correctly; idempotent on re-complete.
- `server/services/certificates/certificate.integration.test.ts` (FR-12): sign → verify round-trips; tampered/expired token rejected. (Mostly pure — may live as a unit test if no DB needed.)
- Role guards (FR-13): use the tRPC caller (`createCaller` with a fabricated session context per role) to assert a `studentProcedure` rejects an instructor/admin mismatch and vice versa, or test the procedure-guard helper directly.

**Verify**: `pnpm test:integration` green against `learnix_test`.

## Step 5 — CI workflow

`.github/workflows/ci.yml` on `pull_request` and `push: [main]`:
- Job `quality`: checkout → pnpm setup → `pnpm install --frozen-lockfile` → `pnpm typecheck` → `pnpm check` (biome) → `pnpm test:unit`.
- Job `integration`: same setup +
  ```yaml
  services:
    postgres:
      image: pgvector/pgvector:pg17
      env: { POSTGRES_DB: learnix_test, POSTGRES_PASSWORD: postgres, POSTGRES_USER: postgres }
      ports: ["5432:5432"]
      options: >-
        --health-cmd pg_isready --health-interval 5s --health-timeout 5s --health-retries 5
  ```
  steps set `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/learnix_test`, run `pnpm prisma migrate deploy`, then `pnpm test:integration`.
- Provide minimal env for build-time `lib/env.js` validation (use `SKIP_ENV_VALIDATION=1` if supported, or pass dummy required vars).
- Document enabling required status checks on `main` in the PR description (repo setting, not code).

**Verify**: push branch, open PR, confirm both jobs run and a failing test blocks the check.

## Step 6 — Fix and expand evals

- `evals/_shared/score.ts`: `accuracyGate(results, threshold, label)` — prints accuracy + failures, exits non-zero below threshold. Refactor the 4 existing courseAI evals to use it; remove `void evaluate`.
- `evals/runEvals.ts`: register all evals; **no-arg → run all** (sequential, aggregate non-zero exit on any failure); `<name>` → single.
- Wire orphans:
  - `evals/lessonAI/tutor.eval.ts` — load `evals/datasets/tutor.jsonl`, run the tutor chain/agent, judge `tools_called` + `answer_contains`.
  - `evals/lessonInsightsAI/lessonInsights.eval.ts` — load `lessonInsights.jsonl`, judge `summary_contains` + `concepts_min` + `glossary_min`.
- New features:
  - `evals/quizAI/quizGeneration.eval.ts` + `evals/datasets/quizAI/*.jsonl` — judge schema validity + question count + non-duplicate answers.
  - `evals/learningPathAI/learningPath.eval.ts` + `evals/datasets/learningPathAI/*.jsonl` — judge path ordering/coverage against expected.

**Verify**: `pnpm eval` runs all; `pnpm eval quizAI:generation` runs one; each prints an accuracy line.

## Step 7 — Docs

- Add ADR-018 reference to any ADR index if one is later created.
- Update `CLAUDE.md` Commands section with the new `test`/`coverage` scripts and a one-line testing-pyramid note.

## Suggested commit slices

1. Vitest + harness (Steps 1–2)
2. Unit tests (Step 3)
3. Integration tests (Step 4)
4. CI workflow (Step 5)
5. Eval fixes + new evals (Step 6)
6. Docs (Step 7)