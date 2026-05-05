# ADR-001: T3 Stack as Application Foundation

- **Status**: Accepted
- **Date**: 2025-11

## Context

Learnix is a full-stack learning management platform. We needed a type-safe, cohesive stack that minimises boilerplate while keeping the DX tight for a small team.

## Decision

Use the T3 Stack: **Next.js App Router** + **tRPC** + **Prisma** + **Tailwind CSS**, bootstrapped via `create-t3-app`.

## Consequences

**Positive**
- End-to-end type safety from the database model through to the React component via tRPC's inferred types and Prisma's generated client.
- `zod-prisma-types` auto-generates Zod schemas from Prisma models, keeping validation in sync with the DB schema without duplication.
- Next.js App Router allows mixing Server Components (data-fetching via RSC tRPC caller) and Client Components (interactive forms, dialogs) in the same tree.
- Turbopack (`next dev --turbo`) provides fast local iteration.

**Negative / Trade-offs**
- App Router is newer; some patterns (e.g., interleaving RSC and CC) require careful design.
- tRPC adds a thin indirection layer; REST endpoints must be added manually when needed (e.g., the SSE chat route and the file upload route are plain Next.js Route Handlers, not tRPC).
