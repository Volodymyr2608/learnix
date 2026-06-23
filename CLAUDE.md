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
- **Routers** (`server/api/routers/`): `certificate`, `course`, `courseAI`, `instructor`, `lesson`, `learningPath`, `lessonAssistant`, `lessonInsightsAI`, `notifications`, `quiz`, `search`, `user` — composed in `server/api/root.ts`.
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

Replaces keyword `LIKE` search with pgvector cosine similarity (ADR-012). Embedding model: `text-embedding-3-small` (1536 dims).

**Data flow:**
- `EmbeddingsService` (`server/services/embeddings/`) — generates vectors via `@langchain/openai`. Three operations: `embedCourse`, `embedLessonChunks` (chunked via `RecursiveCharacterTextSplitter`), `recomputeUserInterest` (centroid of enrolled-course vectors).
- `EmbeddingRepository` (`server/repositories/embedding.repository.ts`) — all raw SQL via `db.$queryRaw`/`db.$executeRaw`. Wraps upsert, replace-chunks, centroid aggregation, and cosine `<=>` queries.
- `SearchService` (`server/services/search/search.service.ts`) — LCEL `RunnableSequence`: embed query → cosine search → hydrate courses. Wrapped with LangSmith `traced`.
- `RecommendationsService` (`server/services/search/recommendations.service.ts`) — fetches user interest vector, excludes enrolled courses, returns top-N by cosine distance. Returns `[]` if fewer than 3 results.

**Embedding hooks (fire-and-forget, `.catch` logged):**
- `CourseService.updateCourse` — calls `embedCourse` when a course is published or when title/subtitle/description/objectives change on an already-published course.
- `LessonService.updateLessonContent` — calls `embedLessonChunks` after saving content if `content` is non-empty.
- `EnrollmentService.enrollInCourse` — calls `recomputeUserInterest` on every new enrollment or re-activation.

**tRPC router** (`server/api/routers/search.ts`, both `studentProcedure`):
- `search.semantic` — embeds the query and returns cosine-ranked published courses (supports `category`/`level` filters).
- `search.recommendations` — returns the current student's personalised course list.

**UI integration:**
- `app/dashboard/browse/page.tsx` — when `?q=` is present, calls `getSemanticSearchResults` instead of `getPublishedCourses`; pagination is hidden for semantic results.
- `app/_components/Dashboard/components/RecommendedRail/` — "Recommended for you" grid on the student dashboard, silently omitted when the service returns fewer than 3 courses.

**Backfill:** `pnpm reindex` (`scripts/reindex-embeddings.ts`) iterates all published courses, lessons with content, and users with enrollments in sequence.

### AI course builder
Streaming SSE endpoint at `app/api/chat/course/route.ts`. Uses a **LangGraph `StateGraph`** (`server/services/courseAI/graph/`) with OpenAI `gpt-4o-mini` to guide instructors through a multi-step course creation flow (`DraftStep` enum: `basic → objectives → requirements → curriculum`).

**Graph nodes:** `classify_intent → tool_router → ToolNode (loop) → chat_response → assess_completion → extract_step_data → validate → confidence_score → persist_and_emit` (or `→ clarify` on validation failure). Two run modes: `chat` (entry at `classify_intent`) and `finalize` (entry at `extract_step_data`).

**`classify_intent` intents:** `continue` (→ `tool_router`), `revise` (→ `revise_prior_field → chat_response`), `clarify` (→ `chat_response` directly, bypasses tools — streams one question to resolve ambiguity between continue and revise, never triggers extraction).

**Revision flow:** `revise_prior_field` updates `content[reviseTarget]` using a flat merge (`{ ...content, ...stepData }`), persists to DB immediately, emits `content_revised` SSE so the preview refetches. Routes to `chat_response` which streams a short confirmation; `assess_completion` returns `ready: false` for revise turns.

**Tools (4):** `search_similar_courses`, `fetch_instructor_prior_courses`, `validate_curriculum_coherence`, `lookup_category_taxonomy`. Instructor ID is sourced from `RunnableConfig.configurable`, not LLM input. `tool_router` includes per-tool guidance in the system prompt.

**Confirmation-gated extraction:** `assess_completion` requires explicit user approval ("ok", "yes", "looks good", etc.). It distinguishes approval of the current step from acknowledgment of a prior-step revision. All LangGraph nodes forward `RunnableConfig` to model calls so `on_chat_model_stream` events propagate correctly.

**Node progress:** `on_chain_start` for informative nodes emits `node_start` SSE; `ToolCallIndicator` shows labels for both tools and nodes.

**Auto-advance:** `confidence_score` ≥ 0.8 triggers automatic step commit; below that the UI shows an Accept button.

**No LangGraph checkpointer** — state is hydrated each request from `CourseGeneration` + `CourseGenerationMessage` tables via repositories (ADR-003). See ADR-016 (LangGraph course builder) for full design.

`CourseAIService` (`server/services/courseAI/`) exposes `runChat` and `runFinalize`. Frontend: `app/_components/Course/components/AIChatBuilderDialog/` — a chat panel (with `ToolCallIndicator`, `ConfidenceBadge`) and a live preview panel (ADR-011).

### Certificates & lifecycle emails
`certificate.listEarned` (`server/api/routers/certificate.ts`, `studentProcedure`) returns the caller's completed enrollments (non-null `completedAt`) via `certificateService.listEarned` → `enrollmentRepository.findCompletedByStudent`. The "My Certificates" page (`app/dashboard/certificates/page.tsx`, RSC) renders them and mints a fresh `signCertificateToken` per row server-side, linking to the existing `GET /api/certificates/[enrollmentId]?token=…` route (unchanged: 200 PDF / 401 bad token / 409 not completed).

`certificate.earned` and `progress.near_completion` emails send **in-process** via the Resend `emailService`, not through n8n: `notificationService.fireCertificateEarned` / `fireProgressNearCompletion` (`server/services/notifications/notification.service.ts`) call `notificationLogRepository.tryLog({dedupKey, automation})` first — `created === false` means already sent, so the send is skipped (at-most-once per enrollment) — then `emailService.send(...)` directly. Both are invoked fire-and-forget from `lesson.service.ts` (`.catch(logger.warn)`); send failures never block the student's progress write. The outbound n8n emitter this used to go through has been deleted; n8n's **inbound** routes (`/api/emails/send`, `/api/notifications/*`, gated by `requireBearer`/`N8N_API_TOKEN`) remain for the still-scheduled inactivity-7d email.

**Student billing:** `billing.listPurchases` (`studentProcedure`) returns the caller's `succeeded`+`refunded` payments. `/dashboard/billing` (RSC) renders them and mints a `signInvoiceToken` per row, linking to `GET /api/invoices/[paymentId]?token=…` (200 PDF / 401 bad token / 404 unknown payment). Invoice PDFs render via `@react-pdf/renderer` (`app/_components/Invoice/`), mirroring the certificate flow. Tokens use `INVOICE_SECRET`, separate from `CERTIFICATE_SECRET`.

### File uploads
Vercel Blob via `app/api/uploads/route.ts`. Course thumbnails (≤2MB images) and preview videos (≤100MB) are uploaded client-side before the tRPC course mutation.

### Payments

Learnix is the **merchant of record**: each sale is a separate Stripe charge on the platform account, followed by a `Stripe.Transfer` to the instructor's connected account. See ADR-019.

**Commission split:** controlled by `STRIPE_PLATFORM_FEE_PERCENT` (default 20%). `computeSplit(priceCents, feePercent?)` in `lib/platformFee.ts` returns `{ platformFeeCents, instructorNetCents }`; `feePercent` falls back to `DEFAULT_PLATFORM_FEE_PERCENT` (20) when omitted or non-numeric, since env validation (and its zod default) is skipped under `SKIP_ENV_VALIDATION` in tests.

**Checkout flow:**
1. `payment.createCheckoutSession` (tRPC) creates a Stripe Checkout Session and returns the URL.
2. Stripe redirects to `app/dashboard/checkout/success/page.tsx` after payment.
3. `finalizeCheckout(sessionId)` is the **idempotent reconcile point** — called both from the webhook (`checkout.session.completed`) and the success page. It creates the `Payment` record and triggers enrollment.

**Webhook:** `app/api/stripe/webhook/route.ts` handles `checkout.session.completed`, `charge.refunded`, and `account.updated`.

**Unonboarded instructors ("allow sale, hold funds"):** if an instructor's Stripe connected account cannot yet receive funds, the sale proceeds and the payment is left `transferStatus: "pending"`. Owed balance is `SUM(instructorNetCents) WHERE transferStatus = 'pending'` (`paymentRepository.getOwedBalance`) — there is **no `owedBalanceCents` column**; the pending payments are the ledger. `transferToInstructor` checks the **live** Stripe account (`accounts.retrieve().payouts_enabled`), not the cached DB flag, so a transfer never depends on an `account.updated` webhook having arrived.

**Sweeping pending transfers when KYC completes:**
- **Automatic (primary):** `account.updated` with `payouts_enabled: true` → `syncAccountStatus` + `connectService.sweepPendingTransfers(userId)`. The sweep attempts each pending payment independently; failures are collected and rethrown as an `AggregateError` so Stripe retries the webhook (already-transferred payments are skipped, so it is idempotent).
- **Manual (admin fallback):** `payment.sweepAllPendingTransfers` (`adminProcedure`), surfaced as a button on `/admin`, groups all `pending` payments by instructor and sweeps each. Use this when `account.updated` was never delivered (e.g. local `stripe listen` missing `--forward-connect-to`, or a newer Stripe API version emitting `v2.core.account.*` instead of `account.updated`).

**tRPC router** (`server/api/routers/payment.ts`):
- `payment.createCheckoutSession` (`studentProcedure`) — creates Stripe session.
- `payment.getSessionStatus` (`studentProcedure`) — polls payment status for the success page.
- `payment.createConnectOnboardingLink` / `payment.createConnectLoginLink` (`instructorProcedure`) — start/resume KYC, open the Express dashboard.
- `payment.getConnectStatus` (`instructorProcedure`) — live KYC status badge + earnings/owed balances.
- `payment.getPlatformRevenue` (`adminProcedure`) — returns `{ totalRevenueCents }` for the admin dashboard.
- `payment.sweepAllPendingTransfers` (`adminProcedure`) — manual sweep of all pending instructor transfers.

**Admin surface:** `app/(admin)/admin/page.tsx` shows total platform revenue via `api.payment.getPlatformRevenue` and a manual "Sweep pending instructor transfers" button.

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
  that's risky/expensive to reverse. `docs/specs/features/<slug>/build/` (requirements → plan →
  validation, same shape as before) during development, distilled into `spec.md` on ship, **plus an
  ADR** in `docs/adr/NNN-<slug>.md`.

`docs/specs/_legacy/` holds the pre-2026-06-23 dated spec folders (history only — never read unless
explicitly asked).

### Implementation

When `docs/specs/features/<slug>/spec.md` already exists and covers the work:
1. **Skip `brainstorming`** for standard-tier work — the spec is the design. Do not re-derive what is
   already written.
2. For complex tier, if `build/plan.md` isn't yet the detailed plan, invoke `writing-plans` (reading
   `build/requirements.md` and `build/spec.md`) to produce it **in `build/plan.md`**.
3. Execute with `subagent-driven-development` or `executing-plans`.
4. **Gate Docs (DoD), before the PR closes:** update the feature's `spec.md` (status + any changed
   Acceptance Criteria), run `pnpm spec:sync`, and write/update an ADR if the change crosses the
   three-month test.

Never run `brainstorming` when a feature's `spec.md` already exists and covers the work at hand.
