# Tech Stack

## Overview

Learnix is built on the **T3 Stack** extended with an AI layer. Every technology choice optimises for type safety, developer velocity, and the ability to compose AI agents cleanly.

---

## Core stack

| Layer | Technology | Why |
|---|---|---|
| Framework | Next.js 15 (App Router, Turbopack) | RSC + streaming; co-locates UI with server logic; Vercel-native |
| API | tRPC v11 + TanStack Query | End-to-end type safety without a separate schema; procedure-level role guards |
| Database | PostgreSQL + Prisma ORM | Reliable relational model; Prisma's type-safe client; split schema for domain isolation |
| Auth | Better Auth | Supports email/password + GitHub + Google out of the box; integrates cleanly with tRPC context |
| Validation | Zod + `zod-prisma-types` | Single source of truth for runtime and compile-time validation; auto-generated DB schemas |
| Styling | Tailwind CSS v4 + Radix UI | Utility-first with accessible primitives; Biome enforces sorted classes |
| File storage | Vercel Blob | Zero-config client-side uploads; works with Vercel deployment target |
| Package manager | pnpm | Fast installs, strict hoisting |
| Linting | Biome | Single tool for lint + format; replaces ESLint + Prettier |

See ADRs in `docs/adr/` for deeper rationale on key choices.

---

## AI layer

All AI features use LangChain with a consistent **guardrail chain → agent → tools** pattern. Responses stream via SSE (same transport as the existing course builder endpoint).

See [ADR-008](../adr/008-langchain-agent-pattern.md) for the full pattern, rules, and feature mapping.

---

## Environment variables

Validated at build time via `@t3-oss/env-nextjs` (`lib/env.js`), except `OPENAI_API_KEY` which is consumed directly in `CourseAIService`.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection |
| `BETTER_AUTH_*` | Auth provider credentials |
| `BASE_URL` | Canonical app URL |
| `OPENAI_API_KEY` | LangChain / OpenAI calls |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob (injected by Vercel) |

---

## Deployment target

**Vercel**. The `vercel-build` script runs `prisma generate && prisma migrate deploy && next build`. Local development uses PostgreSQL in Docker on port 5433.
