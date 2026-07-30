# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev              # Start dev server with Turbopack
pnpm build            # Production build
pnpm typecheck        # TypeScript type checking (tsc --noEmit)
pnpm check            # Biome lint + format check
pnpm check:write      # Biome lint + format with auto-fix
pnpm check:unsafe     # Biome check with unsafe auto-fix

# Database
pnpm db:generate      # Create a new migration (prisma migrate dev)
pnpm db:migrate       # Apply migrations (prisma migrate deploy)
pnpm db:push          # Push schema without migration (for dev)
pnpm db:studio        # Open Prisma Studio
pnpm generate         # Regenerate Prisma client (prisma generate)
pnpm reindex          # Backfill all course/lesson/user embeddings (scripts/reindex-embeddings.ts)

# Tests
pnpm test             # Run all tests once (unit + integration)
pnpm test:unit        # Unit tests only (no DB required)
pnpm test:integration # Integration tests (requires learnix_test DB — see .env.test.example)
pnpm test:watch       # Watch mode
pnpm coverage         # Unit test coverage report

# Evals (offline, call OpenAI — run before merging prompt changes)
pnpm eval             # Run all evals
pnpm eval <name>      # Run one eval, e.g. pnpm eval courseAI:classifyIntent
```

**Local database**: PostgreSQL via Docker on port 5433.
```bash
docker-compose up -d  # Start the database
```

**Pre-commit hook**: Biome runs on staged files via lint-staged.

**Testing pyramid**:
- `*.test.ts` — unit tests, colocated next to source; no DB, no network
- `*.integration.test.ts` — service + repository tests against a real `learnix_test` Postgres
- `evals/` — offline LLM quality checks; manual before prompt changes, never in PR CI

## Architecture

T3 Stack app: Next.js 16 App Router + tRPC + Prisma + Better Auth.

### Route groups
- `app/(auth)/` — sign-in, sign-up pages
- `app/(marketing)/` — public landing pages (courses, instructors, pricing)
- `app/dashboard/` — student dashboard (browse, enrolled courses, progress)
- `app/instructor/` — instructor portal (course CRUD, students)

### tRPC setup
- **Server RSC** (`trpc/server.ts`): `api` exported from here for Server Components, using `createCaller`.
- **Client** (`trpc/client.tsx`): `api` exported from here for Client Components, using `createTRPCReact`.
- **Routers** (`server/api/routers/`): `analytics`, `billing`, `certificate`, `course`, `courseAI` (file `ai.ts`), `instructor`, `learningPath`, `lesson`, `lessonAssistant`, `lessonInsightsAI`, `message`, `notifications`, `payment`, `quiz`, `review`, `search`, `student`, `user` — composed in `server/api/root.ts`.
- **Procedure types** (`server/api/trpc.ts`): `publicProcedure`, `protectedProcedure`, `instructorProcedure`, `studentProcedure`, `adminProcedure` — role enforcement is done at the procedure level.

### Auth
Better Auth (`server/better-auth/`) with email/password, GitHub, and Google OAuth. Session is injected into the tRPC context. The `role` field on `User` (`STUDENT` | `INSTRUCTOR` | `ADMIN`) gates access to role-specific tRPC procedures.

### Server-side layer
Three-layer pattern: **routers → services → repositories**.
- `server/repositories/` — data access, all extend `BaseRepository` (`server/repositories/base/base.repository.ts`) which handles CRUD, soft-delete, pagination, and transactions generically.
- `server/services/` — business logic; each service has a companion `.errors.ts` file for typed errors.
- `server/entities/` — Zod DTOs and TypeScript types shared between server and client.

### Prisma schema
Split across `prisma/schema/` (multiple `.prisma` files). The `previewFeatures = ["prismaSchemaFolder"]` flag enables this. Generated client goes to `generated/prisma/`. Zod types are auto-generated to `prisma/zod/` via `zod-prisma-types`.

Key models: `User` (with `Role` enum), `Course` (soft-deleted), `Section`, `Lesson`, `Enrollment`, `CourseProgress`, `InstructorProfile`, `CourseReview`, `CourseGeneration` (AI builder state), `CourseGenerationMessage`, `CourseEmbedding`, `LessonChunkEmbedding`, `UserInterestEmbedding` (pgvector — see ADR-012).

### Feature specs
Every shipped feature has a living spec under `docs/specs/features/<slug>/spec.md`, cataloged in
[`docs/specs/features/_index.md`](docs/specs/features/_index.md) — **read the relevant spec before
changing a feature's behavior.**

### UI components
Shared UI primitives in `app/_components/_shared/ui/` (Radix UI + Tailwind). Controlled form components in `app/_components/_shared/components/Form/`. Course forms use `react-hook-form` + Zod via `useCourseForm` hook. Drag-and-drop curriculum reordering uses `@dnd-kit`.

**Component conventions (enforced across all features):**

- **`types.ts` always.** Every component folder must have a colocated `types.ts`. All prop types — including internal sub-component props — live there, never inline in `index.tsx`. No `Record<string, never>` placeholder types; omit the type entirely if a component takes no props.

- **One component per folder; helpers in `utils.ts`.** Decompose every non-trivial component into separate sub-components — never leave several components stacked in one `index.tsx`. Each sub-component gets its own folder under `components/` with a colocated `index.tsx` and `types.ts` (mirroring `Messaging/MessagesView/components/Inbox` and `…/Thread`). Pure, non-JSX helpers (formatters, label builders, grouping logic) move out of `index.tsx` into a colocated `utils.ts`. This applies whenever you write or plan code — when producing a `build/plan.md`, the tasks must already reflect this folder layout, not bundle everything into one file to split later.

- **Arrow functions everywhere.** All components and helpers are arrow-function consts (`export const Thread = (props: ThreadProps) => { … }`, `export const dateSeparatorLabel = (date: Date): string => { … }`), including inner event handlers (`const handleSent = () => { … }`). Do not use `function` declarations for components or helpers.

- **No nested ternaries.** Enforced by Biome (`style/noNestedTernary`, error). Two or more conditions branching on the same state must be expressed as early-return functions, a lookup map, or separate named components, not chained `? ... : ... : ...`. The one allowed ternary is a single binary branch (e.g., loading spinner vs. content).

  ```tsx
  // ❌ nested ternary
  {isEnrolled ? <ContinueBtn /> : priceCents > 0 ? <BuyBtn /> : <EnrollBtn />}

  // ✅ extracted sub-component with early returns
  const EnrollAction = ({ isEnrolled, priceCents, ... }: EnrollActionProps) => {
    if (isEnrolled) return <ContinueBtn />;
    if (priceCents > 0) return <BuyBtn />;
    return <EnrollBtn />;
  };
  ```

- **Extract sub-components for repeated layout.** Any JSX structure copy-pasted more than twice (e.g., a card wrapper, a status icon + title + description pattern) must become its own arrow-function sub-component in its own folder (per "One component per folder" above). Its prop type goes in that folder's `types.ts`.

- **Sub-components own their own mutations.** When a button triggers a tRPC mutation, the mutation lives inside the sub-component that owns the button — not hoisted to the parent. The parent passes a plain callback (e.g., `onEnrollFree: () => void`) only when it needs to coordinate shared state (like a dialog).

- **Flatten loading states.** Instead of nesting `isLoading ? <Spinner /> : data ? <Content /> : null`, use sequential boolean guards that read independently:
  ```tsx
  {isLoading && <Spinner />}
  {!isLoading && data && <Content data={data} />}
  ```

### Environment variables
All vars are declared and validated at build time via `@t3-oss/env-nextjs` in `lib/env.js` — that
file is the source of truth for what's required vs. optional. Add new vars there (and to
`runtimeEnv`), not in a list here.

### Linting / formatting
Biome (not ESLint/Prettier). Config in `biome.jsonc`. Auto-sorts imports and Tailwind classes (`useSortedClasses` for `clsx`/`cva`/`cn` calls).

## Development Workflow

Hybrid Intent + ADR + Harness model. Rationale and alternatives considered:
[`docs/adr/020-hybrid-documentation-model.md`](docs/adr/020-hybrid-documentation-model.md). Full
mechanics — tier-decision checklist, `spec.md` format, lifecycle, `_index.md` generation, worked
examples, example prompts — live in
[`docs/specs/documentation-process.md`](docs/specs/documentation-process.md); read that before
asking "which tier is this" or "what do I write in the prompt," it's answered there (§3a/§3b).

Three tiers, decided from what the change actually touches, not from how the request is phrased:

- **trivial/fix** — bug fix, refactor, no change to any feature's documented behavior. No spec, no
  ADR. Go straight to `systematic-debugging` + `test-driven-development` against the harness.
- **standard** — new feature or behavior change, built from existing patterns. One living
  `docs/specs/features/<slug>/spec.md` (Purpose / Functional scope / Acceptance criteria / Agent
  notes), created from [`docs/templates/feature-spec.md`](docs/templates/feature-spec.md). Run
  `brainstorming` first to pin scope.
- **complex** — touches money, the auth/security model, a new external service, or a data migration
  that's risky/expensive to reverse. Same `spec.md` + detailed `build/plan.md` as standard, distilled
  into `spec.md` on ship, **plus an ADR** in `docs/adr/NNN-<slug>.md`.

Only two documents are used per feature: `spec.md` (the living design) and `build/plan.md` (the
detailed implementation plan). `requirements.md` and `validation.md` are **not** used — fold the
problem/scope into `spec.md`'s Purpose/Functional scope and verification into the plan's per-task
tests and `## Final verification`.

Features shipped before 2026-06-23 predate this model and have no living spec — their code and tests
are the record. The retired dated spec folders were deleted on 2026-07-30; if you need one, it is in
git history, not in the tree.

### Implementation

**Entry path — the spec-gated command chain (ADR-021).** Standard/complex work runs
`/spec → /plan → /implement → /qa` (`.claude/commands/`). The gate is structural: `/implement`
refuses to run without an approved `build/plan.md`, which requires an approved `spec.md` — so specs
and plans are never backfilled after the code. Trivial/fix work skips the chain (`/spec` detects it
and routes to `systematic-debugging` + TDD). Standing non-negotiables live in
[`docs/constitution.md`](docs/constitution.md). Mechanics: [`documentation-process.md`](docs/specs/documentation-process.md) §3c.

**Always produce a detailed, written, approved plan before any implementation code** — for every
tier above trivial/fix, not just complex. Use the `writing-plans` skill to produce the **detailed
implementation plan** (bite-sized TDD tasks with real code, exact file paths, and commits) at
`docs/specs/features/<slug>/build/plan.md` (from `docs/templates/plan.md`). Get explicit approval on
that plan before executing. Never start coding from the spec alone or invent tasks as you go.

When `docs/specs/features/<slug>/spec.md` already exists and covers the work:
1. **Skip `brainstorming`** for standard-tier work — the spec is the design. Do not re-derive what is
   already written.
2. Produce the detailed `build/plan.md` via `writing-plans` (reading `spec.md`) and get it approved
   **before** writing code.
3. Execute with `subagent-driven-development` or `executing-plans` **continuously** — run all tasks
   end to end. Do not pause between tasks to ask "should I continue?" or to make the user check
   status; stop only for a genuine blocker you cannot resolve yourself, or when all tasks are done.
4. **Gate Docs (DoD), before the PR closes:** update the feature's `spec.md` (status + any changed
   Acceptance Criteria), run `pnpm spec:sync`, and write/update an ADR if the change crosses the
   three-month test.

Never run `brainstorming` when a feature's `spec.md` already exists and covers the work at hand.
