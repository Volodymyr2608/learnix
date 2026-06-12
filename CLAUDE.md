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
- **Routers** (`server/api/routers/`): `course`, `courseAI`, `instructor`, `lesson`, `learningPath`, `lessonAssistant`, `lessonInsightsAI`, `notifications`, `quiz`, `search`, `user` — composed in `server/api/root.ts`.
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

### File uploads
Vercel Blob via `app/api/uploads/route.ts`. Course thumbnails (≤2MB images) and preview videos (≤100MB) are uploaded client-side before the tRPC course mutation.

### UI components
Shared UI primitives in `app/_components/_shared/ui/` (Radix UI + Tailwind). Controlled form components in `app/_components/_shared/components/Form/`. Course forms use `react-hook-form` + Zod via `useCourseForm` hook. Drag-and-drop curriculum reordering uses `@dnd-kit`.

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
| `N8N_API_TOKEN` | Yes | Bearer token for n8n webhook routes |
| `N8N_WEBHOOK_BASE_URL` | Yes | n8n instance webhook base URL |
| `N8N_WEBHOOK_SECRET` | Yes | HMAC secret for outbound n8n calls |
| `CERTIFICATE_SECRET` | Yes | JWT signing secret for certificate download tokens |
| `UNSUBSCRIBE_SECRET` | Yes | JWT signing secret for email unsubscribe tokens |

### Linting / formatting
Biome (not ESLint/Prettier). Config in `biome.jsonc`. Auto-sorts imports and Tailwind classes (`useSortedClasses` for `clsx`/`cva`/`cn` calls).

## Development Workflow

Spec-driven development. Each feature gets **one folder** `docs/specs/<YYYY-MM-DD>-<feature>/`
holding **four documents**, produced **sequentially with a manual approval gate between each** —
never generate the next document until the previous one is approved. Start each document from the
templates in [`docs/templates/`](docs/templates/) (`cp docs/templates/{requirements,spec,plan,validation}.md` into the feature folder):

1. `requirements.md` — from the raw idea: problem, goal, scope decisions, functional requirements,
   out-of-scope. The *what* and *why*. → **approve**
2. `spec.md` — from `requirements.md`: technical design — data model, layering, component flow,
   file list, env vars, referenced ADRs. The *how* (design). → **approve**
3. `plan.md` — from `spec.md`: the **detailed implementation plan** (bite-sized TDD tasks with real
   code, exact file paths, and commits), produced with the `writing-plans` skill. → **approve**
4. `validation.md` — from all of the above: automated checks + manual test scenarios — how to verify.

The detailed plan **lives in the spec folder as `plan.md`**, not in `docs/superpowers/plans/`. When
`writing-plans` runs, override its default save location to the spec folder.

If a feature warrants an architectural decision, also write an ADR in `docs/adr/NNN-<slug>.md` and
reference it from `spec.md`.

### Implementation

When `docs/specs/<feature>/` already exists with an approved `plan.md`:
1. **Skip `brainstorming`** — the spec is the design. Do not re-derive what is already written.
2. If `plan.md` is not yet the detailed plan, invoke `writing-plans` directly (reading all spec
   files) to produce it **in the spec folder as `plan.md`**.
3. Execute `plan.md` with `subagent-driven-development` or `executing-plans`.

Never run `brainstorming` when a spec folder already exists in `docs/specs/`.
