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
```

**Local database**: PostgreSQL via Docker on port 5433.
```bash
docker-compose up -d  # Start the database
```

**Pre-commit hook**: Biome runs on staged files via lint-staged. No test suite is configured.

## Architecture

T3 Stack app: Next.js 15 App Router + tRPC + Prisma + Better Auth.

### Route groups
- `app/(auth)/` — sign-in, sign-up pages
- `app/(marketing)/` — public landing pages (courses, instructors, pricing)
- `app/dashboard/` — student dashboard (browse, enrolled courses, progress)
- `app/instructor/` — instructor portal (course CRUD, students)

### tRPC setup
- **Server RSC** (`trpc/server.ts`): `api` exported from here for Server Components, using `createCaller`.
- **Client** (`trpc/client.tsx`): `api` exported from here for Client Components, using `createTRPCReact`.
- **Routers** (`server/api/routers/`): `course`, `courseAI`, `instructor`, `user`, `search` — composed in `server/api/root.ts`.
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
Streaming SSE endpoint at `app/api/chat/course/route.ts`. Uses LangChain + OpenAI (`gpt-4o-mini`) to guide instructors through a multi-step course creation flow (`DraftStep` enum). Each step collects specific course data, persisted to `CourseGeneration.content`. The `CourseAIService` (`server/services/courseAI/`) handles streaming, step extraction, and message persistence. Frontend: `app/_components/Course/components/AIChatBuilderDialog/` — a chat panel with a live preview panel.

### File uploads
Vercel Blob via `app/api/uploads/route.ts`. Course thumbnails (≤2MB images) and preview videos (≤100MB) are uploaded client-side before the tRPC course mutation.

### UI components
Shared UI primitives in `app/_components/_shared/ui/` (Radix UI + Tailwind). Controlled form components in `app/_components/_shared/components/Form/`. Course forms use `react-hook-form` + Zod via `useCourseForm` hook. Drag-and-drop curriculum reordering uses `@dnd-kit`.

### Environment variables
Validated at build time via `@t3-oss/env-nextjs` in `lib/env.js`. Required vars: `DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_GITHUB_CLIENT_ID/SECRET`, `BETTER_AUTH_GOOGLE_CLIENT_ID/SECRET`, `BASE_URL`, and `OPENAI_API_KEY` (used directly in `CourseAIService`, not validated in env schema).

### Linting / formatting
Biome (not ESLint/Prettier). Config in `biome.jsonc`. Auto-sorts imports and Tailwind classes (`useSortedClasses` for `clsx`/`cva`/`cn` calls).

## Development Workflow

Spec-driven development with two phases.

### Phase 1 — Planning (run with Opus)

Specs live in `docs/specs/<YYYY-MM-DD>-<feature>/` with three files:
- `requirements.md` — problem, goal, functional requirements, DB models, file list
- `plan.md` — implementation order and code sketches
- `validation.md` — automated checks and manual test scenarios

### Phase 2 — Implementation (run with Sonnet)

When `docs/specs/<feature>/` already exists:
1. **Skip `brainstorming`** — the spec is the design. Do not re-derive what is already written.
2. Invoke `writing-plans` directly, reading all three spec files to produce a step-by-step execution plan in `docs/superpowers/plans/`.
3. Execute with `subagent-driven-development` or `executing-plans`.

Never run `brainstorming` when a spec already exists in `docs/specs/`.
