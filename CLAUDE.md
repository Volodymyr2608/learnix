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

### Semantic search & recommendations

pgvector cosine similarity (ADR-012), `text-embedding-3-small`. Services in
`server/services/embeddings/` (`EmbeddingsService`) and `server/services/search/` (`SearchService`,
`RecommendationsService`); raw-SQL repo in `server/repositories/embedding.repository.ts` (the `<=>`
cosine operator isn't expressible via Prisma's query builder). tRPC: `search.semantic`,
`search.recommendations` (both `studentProcedure`). Backfill via `pnpm reindex`. Full behavior,
embedding hooks, and UI integration: `docs/specs/features/semantic-search-recommendations/spec.md`.

### AI course builder
Streaming SSE endpoint at `app/api/chat/course/route.ts`, driven by a LangGraph `StateGraph`
(`server/services/courseAI/graph/`) through a fixed step order (`DraftStep`: `basic → objectives →
requirements → curriculum`). `CourseAIService` (`server/services/courseAI/`) exposes
`runChat`/`runFinalize`; frontend is `app/_components/Course/components/AIChatBuilderDialog/`. Full
graph/node design, tools, and confirmation-gating: `docs/specs/features/ai-course-builder/spec.md`;
design rationale in ADR-016.

### Certificates, lifecycle emails & billing
Certificate download: `certificate.listEarned` → `/dashboard/certificates` (RSC) → signed-token
download via `GET /api/certificates/[enrollmentId]?token=…`. Lifecycle emails
(`certificate.earned`, `progress.near_completion`) send in-process via Resend, deduped through
`notificationLogRepository.tryLog`, fire-and-forget from `lesson.service.ts`. n8n's inbound routes
remain only for the inactivity-7d email. Student billing mirrors the same token-download shape for
invoices (`billing.listPurchases` → `/dashboard/billing` → `GET /api/invoices/[paymentId]?token=…`,
`INVOICE_SECRET`). Full behavior: `docs/specs/features/certificates/spec.md` and
`docs/specs/features/billing/spec.md`.

### File uploads
Vercel Blob via `app/api/uploads/route.ts`. Course thumbnails (≤2MB images) and preview videos (≤100MB) are uploaded client-side before the tRPC course mutation.

### Payments

Learnix is the **merchant of record**: each sale is a separate Stripe charge on the platform account,
followed by a `Stripe.Transfer` to the instructor's connected account (ADR-019). Router:
`server/api/routers/payment.ts`. Webhook: `app/api/stripe/webhook/route.ts`. Admin surface:
`app/(admin)/admin/page.tsx`.

- `transferToInstructor` checks the **live** Stripe account (`accounts.retrieve().payouts_enabled`),
  not the cached DB flag — a transfer never depends on an `account.updated` webhook having arrived.
- There is **no `owedBalanceCents` column** — owed balance is `SUM(instructorNetCents) WHERE
  transferStatus = 'pending'`; the pending payments are the ledger.

Full checkout/webhook/sweep behavior: `docs/specs/features/payments/spec.md`; design rationale and
alternatives considered: ADR-019.

### UI components
Shared UI primitives in `app/_components/_shared/ui/` (Radix UI + Tailwind). Controlled form components in `app/_components/_shared/components/Form/`. Course forms use `react-hook-form` + Zod via `useCourseForm` hook. Drag-and-drop curriculum reordering uses `@dnd-kit`.

**Component conventions (enforced across all features):**

- **`types.ts` always.** Every component folder must have a colocated `types.ts`. All prop types — including internal sub-component props — live there, never inline in `index.tsx`. No `Record<string, never>` placeholder types; omit the type entirely if a component takes no props.

- **No nested ternaries in JSX.** Two or more conditions branching on the same state must be expressed as early-return functions or separate named components, not chained `? ... : ... : ...`. The one allowed ternary is a single binary branch (e.g., loading spinner vs. content).

  ```tsx
  // ❌ nested ternary
  {isEnrolled ? <ContinueBtn /> : priceCents > 0 ? <BuyBtn /> : <EnrollBtn />}

  // ✅ extracted sub-component with early returns
  function EnrollAction({ isEnrolled, priceCents, ... }: EnrollActionProps) {
    if (isEnrolled) return <ContinueBtn />;
    if (priceCents > 0) return <BuyBtn />;
    return <EnrollBtn />;
  }
  ```

- **Extract sub-components for repeated layout.** Any JSX structure copy-pasted more than twice (e.g., a card wrapper, a status icon + title + description pattern) must become a named function component above the main export. Its prop type goes in `types.ts`.

- **Sub-components own their own mutations.** When a button triggers a tRPC mutation, the mutation lives inside the sub-component that owns the button — not hoisted to the parent. The parent passes a plain callback (e.g., `onEnrollFree: () => void`) only when it needs to coordinate shared state (like a dialog).

- **Flatten loading states.** Instead of nesting `isLoading ? <Spinner /> : data ? <Content /> : null`, use sequential boolean guards that read independently:
  ```tsx
  {isLoading && <Spinner />}
  {!isLoading && data && <Content data={data} />}
  ```

### Environment variables
All vars validated at build time via `@t3-oss/env-nextjs` in `lib/env.js`.

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `BETTER_AUTH_URL` | Yes | Auth base URL |
| `BETTER_AUTH_SECRET` | Prod only | Auth signing secret |
| `BETTER_AUTH_GITHUB_CLIENT_ID/SECRET` | Yes | GitHub OAuth |
| `BETTER_AUTH_GOOGLE_CLIENT_ID/SECRET` | Yes | Google OAuth |
| `BASE_URL` | Yes | Public app URL |
| `OPENAI_API_KEY` | Yes | AI features (course builder, quiz, lesson assistant, embeddings) |
| `LANGSMITH_API_KEY` | Optional | LangSmith tracing |
| `LANGSMITH_PROJECT` | Optional | LangSmith project name |
| `LANGSMITH_TRACING` | Optional | Enable LangSmith tracing (`"true"`) |
| `RESEND_API_KEY` | Yes | Transactional email |
| `EMAIL_FROM_ADDRESS` | Yes | Sender address for emails |
| `EMAIL_REPLY_TO` | Optional | Reply-to address |
| `N8N_API_TOKEN` | Yes | Bearer token for n8n's inbound webhook routes (still used by the scheduled inactivity-7d email) |
| `N8N_WEBHOOK_BASE_URL` | Yes | n8n instance webhook base URL (unused since `certificate.earned`/`progress.near_completion` send directly via Resend; kept for the inactivity job) |
| `N8N_WEBHOOK_SECRET` | Yes | HMAC secret for outbound n8n calls (unused for the same reason) |
| `CERTIFICATE_SECRET` | Yes | JWT signing secret for certificate download tokens |
| `INVOICE_SECRET` | Yes | JWT signing secret for billing invoice download tokens |
| `UNSUBSCRIBE_SECRET` | Yes | JWT signing secret for email unsubscribe tokens |
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key (test: `sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe webhook signing secret for platform events (`whsec_...`) |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Yes | Stripe webhook signing secret for Connect events (`account.updated`) |
| `STRIPE_PLATFORM_FEE_PERCENT` | No (default 20) | Platform fee percentage taken from each sale |

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

`docs/specs/_legacy/` holds the pre-2026-06-23 dated spec folders (history only — never read unless
explicitly asked).

### Implementation

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
