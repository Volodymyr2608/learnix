# Learnix

An online learning platform where instructors publish courses and students enroll, track progress, and leave reviews. Instructors can optionally generate a course draft through an AI-assisted chat builder.

Built on the T3 Stack: **Next.js 15** · **tRPC** · **Prisma** · **Better Auth** · **Tailwind CSS** · **TypeScript**.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, Turbopack) |
| API | tRPC v11 + TanStack Query |
| Database | PostgreSQL via Prisma ORM |
| Auth | Better Auth (email/password + GitHub + Google OAuth) |
| AI | LangChain + OpenAI `gpt-4o-mini` |
| File storage | Vercel Blob |
| Styling | Tailwind CSS v4 + Radix UI |
| Validation | Zod (+ `zod-prisma-types` for auto-generated schemas) |
| Linting | Biome |
| Package manager | pnpm |

---

## Getting started

### Prerequisites

- Node.js (see `.nvmrc`)
- pnpm `10.4.1+`
- Docker or Podman (for the local database)

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Fill in `.env`:

```env
# Database (Postgres)
DATABASE_URL="postgresql://postgres:password@localhost:5433/learnix"

# Better Auth
BETTER_AUTH_URL="http://localhost:3000"
BETTER_AUTH_SECRET="your-secret"
BETTER_AUTH_GITHUB_CLIENT_ID=""
BETTER_AUTH_GITHUB_CLIENT_SECRET=""
BETTER_AUTH_GOOGLE_CLIENT_ID=""
BETTER_AUTH_GOOGLE_CLIENT_SECRET=""

# App
BASE_URL="http://localhost:3000"

# AI course builder (optional – required only for the AI chat feature)
OPENAI_API_KEY=""
```

### 3. Start the database

```bash
./start-database.sh        # Linux / macOS
# or
docker-compose up -d
```

### 4. Run migrations and generate the Prisma client

```bash
pnpm db:generate           # create + apply migration (dev)
pnpm generate              # regenerate Prisma client
```

### 5. Start the dev server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start dev server with Turbopack |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm typecheck` | TypeScript type checking |
| `pnpm check` | Biome lint + format check |
| `pnpm check:write` | Biome lint + format with auto-fix |
| `pnpm db:generate` | Create and apply a new migration |
| `pnpm db:migrate` | Apply pending migrations (CI / production) |
| `pnpm db:push` | Push schema without a migration file |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm generate` | Regenerate Prisma client |

---

## Project structure

```
app/
├── (auth)/              Sign-in and sign-up pages
├── (marketing)/         Public pages — courses, instructors, pricing
├── dashboard/           Student portal — browse, enrolled courses, progress
├── instructor/          Instructor portal — course CRUD, students
└── api/
    ├── auth/[...all]/   Better Auth route handler
    ├── chat/course/     SSE streaming endpoint for AI course builder
    ├── trpc/[trpc]/     tRPC route handler
    └── uploads/         Vercel Blob upload endpoint

server/
├── api/routers/         tRPC routers (course, courseAI, instructor, user)
├── better-auth/         Auth config, server + client helpers
├── entities/            Zod DTOs and TypeScript types
├── repositories/        Prisma data-access layer (extends BaseRepository)
├── services/            Business logic (CourseService, EnrollmentService, …)
└── db.ts                Prisma client singleton

prisma/schema/           Split Prisma schema (one file per domain)
```

For architectural decisions and feature specifications see [`docs/`](docs/README.md).

---

## Features

### For students
- Browse and search published courses
- Enroll in courses
- Track lesson and course progress
- Leave ratings and reviews

### For instructors
- Create and manage courses (title, description, curriculum, media, pricing)
- Drag-and-drop section reordering
- AI-powered course builder: generate a full course draft through a guided chat
- View student enrollment stats

---

## Deployment

The app is designed for **Vercel** deployment. The `vercel-build` script runs `prisma generate && prisma migrate deploy && next build`.

Required Vercel environment variables: all variables listed in `.env.example` plus `OPENAI_API_KEY` and the Vercel-injected `BLOB_READ_WRITE_TOKEN`.
