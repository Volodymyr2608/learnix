# Learnix

An online learning platform where instructors publish courses and students enroll, track progress, and leave reviews. Instructors can generate a course draft through an AI-assisted chat builder and generate quiz questions for any lesson using an AI agent.

Built on the T3 Stack: **Next.js 16** · **tRPC** · **Prisma** · **Better Auth** · **Tailwind CSS** · **TypeScript**.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| API | tRPC v11 + TanStack Query |
| Database | PostgreSQL via Prisma ORM (v6) |
| Auth | Better Auth v1 (email/password + GitHub + Google OAuth) |
| AI | LangChain + LangGraph + OpenAI `gpt-4o-mini` |
| AI tracing | LangSmith |
| Payments | Stripe Checkout + Stripe Connect (instructor payouts) |
| File storage | Vercel Blob |
| Email | Resend + React Email |
| Automation | n8n (inactivity nudge webhook only) |
| Styling | Tailwind CSS v4 + Radix UI |
| Validation | Zod v4 (+ `zod-prisma-types` for auto-generated schemas) |
| Linting | Biome v2 |
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

# AI features (course builder, quiz, lesson assistant, learning path)
OPENAI_API_KEY=""

# LangSmith tracing (optional)
LANGSMITH_API_KEY=""
LANGSMITH_PROJECT="learnix"
LANGSMITH_TRACING="false"

# Email (Resend)
RESEND_API_KEY=""
EMAIL_FROM_ADDRESS="noreply@yourdomain.com"
EMAIL_REPLY_TO=""           # optional

# n8n automation webhooks (inactivity-nudge email only)
N8N_API_TOKEN=""
N8N_WEBHOOK_BASE_URL="http://localhost:5678"
N8N_WEBHOOK_SECRET=""

# Stripe (checkout + Connect payouts)
STRIPE_SECRET_KEY=""
STRIPE_WEBHOOK_SECRET=""
STRIPE_CONNECT_WEBHOOK_SECRET=""
STRIPE_PLATFORM_FEE_PERCENT="20"   # optional, defaults to 20

# Token signing
CERTIFICATE_SECRET=""
INVOICE_SECRET=""
UNSUBSCRIBE_SECRET=""
```

### 3. Start the database

```bash
./start-database.sh        # Linux / macOS
# or
docker-compose up -d
```

This also starts `redis` and `srh` (serverless-redis-http). The AI rate limiter's
Redis-backed tests need both, plus the two `KV_REST_API_*` values from
`.env.test.example` in your `.env.test`. `@upstash/redis` speaks HTTP rather than the
Redis wire protocol, which is why the proxy is there. Without them `pnpm test:redis`
**skips** rather than fails, so neither CI nor a fresh checkout needs Redis.

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
| `pnpm reindex` | Backfill all course/lesson/user embeddings |
| `pnpm eval` | Run LangSmith offline evals |
| `pnpm dev:n8n` | Start n8n via Docker Compose |
| `pnpm dev:n8n:down` | Stop n8n containers |
| `pnpm sync:n8n` | Push local workflow files to the running n8n instance |

---

## Project structure

```
app/
├── (auth)/              Sign-in and sign-up pages
├── (marketing)/         Public pages — courses, instructors, pricing
├── dashboard/           Student portal — browse, enrolled courses, progress
├── instructor/          Instructor portal — course CRUD, students
└── api/
    ├── auth/[...all]/            Better Auth route handler
    ├── chat/course/              SSE: AI course builder (instructor)
    ├── chat/lesson/              SSE: AI lesson assistant (student)
    ├── chat/learning-path/       SSE: AI learning path generator (student)
    ├── certificates/[id]/        PDF certificate download (JWT-gated)
    ├── invoices/[paymentId]/     PDF billing invoice download (JWT-gated)
    ├── stripe/webhook/           Stripe webhook (checkout, refunds, Connect account updates)
    ├── emails/send/              Send transactional email (bearer-auth)
    ├── notifications/
    │   ├── inactive-students/    Cron webhook: inactive student nudge (n8n)
    │   └── log/                  Dedup log for n8n automations (bearer-auth)
    ├── trpc/[trpc]/              tRPC route handler
    └── uploads/                  Vercel Blob upload endpoint

server/
├── api/routers/         tRPC routers: analytics, billing, certificate, course,
│                        courseAI, instructor, learningPath, lesson,
│                        lessonAssistant, lessonInsightsAI, message,
│                        notifications, payment, quiz, review, search,
│                        student, user
├── better-auth/         Auth config, server + client helpers
├── entities/            Zod DTOs and TypeScript types
├── repositories/        Prisma data-access layer (extends BaseRepository)
├── services/            Business logic (CourseService, QuizService, …)
└── db.ts                Prisma client singleton

prisma/schema/           Split Prisma schema (one file per domain)
```

For architectural decisions and feature specifications see [`docs/`](docs/README.md).

---

## Features

### For students
- Browse and search published courses (keyword + semantic vector search)
- Personalised course recommendations (pgvector cosine similarity on enrolment history)
- Buy paid courses via Stripe Checkout, or enrol instantly in free ones
- Download a billing invoice (PDF) for any purchase
- Enrol in courses and track lesson/course progress
- Take lesson quizzes with immediate feedback; each question can only be submitted once
- AI lesson assistant: ask questions about lesson content mid-lesson
- AI learning path: personalised study plan that adapts as you complete lessons and quizzes
- Download a completion certificate as PDF once a course is finished
- Leave ratings and reviews
- Message instructors directly about a course
- Manage email notification preferences

### For instructors
- Create and manage courses (title, description, curriculum, media, pricing)
- Drag-and-drop section/lesson reordering
- AI-powered course builder: generate a full course draft through a guided multi-step chat (LangGraph)
- Add quiz questions per lesson manually or generate them with AI (3–5 multiple-choice questions from lesson content)
- Lesson auto-summary: generate an AI summary, concept list, and glossary for any lesson
- Get paid via Stripe Connect — onboard once, then receive an automatic transfer per sale
  (commission split applied), with a held-balance fallback before onboarding completes
- View enrolment, revenue, and review analytics across courses
- Message students directly about a course

### Platform automations (n8n)
- Inactive-student nudge email sent via a scheduled n8n webhook — the only automation still
  routed through n8n; certificate-earned and near-completion emails send in-process via Resend.

---

## Deployment

The app is designed for **Vercel** deployment. The `vercel-build` script runs `prisma generate && prisma migrate deploy && next build`.

Required Vercel environment variables: everything in `.env.example` plus the Vercel-injected `BLOB_READ_WRITE_TOKEN`. All vars are validated at build time via `@t3-oss/env-nextjs` (`lib/env.js`).
