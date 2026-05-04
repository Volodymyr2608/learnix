# ADR-004: Role-Based Access via tRPC Procedure Layer

- **Status**: Accepted
- **Date**: 2026-03

## Context

The platform has three user roles: `STUDENT`, `INSTRUCTOR`, `ADMIN`. Different tRPC endpoints must be restricted to specific roles. We needed a consistent, declarative way to enforce this at the API boundary.

## Decision

Define role-specific procedure factories in `server/api/trpc.ts` using tRPC middleware chaining:

```
publicProcedure       → no auth required
protectedProcedure    → must be authenticated
instructorProcedure   → authenticated + Role.INSTRUCTOR
studentProcedure      → authenticated + Role.STUDENT
adminProcedure        → authenticated + Role.ADMIN
```

Each role procedure builds on `protectedProcedure` via a shared `roleProcedure(role)` factory that throws `FORBIDDEN` if the session user's role doesn't match.

## Consequences

**Positive**
- Role enforcement is co-located with the tRPC init, not scattered across individual router handlers.
- Adding a new role requires one additional export from `trpc.ts`.
- TypeScript narrows `ctx.session.user` to non-nullable after `protectedProcedure`, eliminating null-checks inside handlers.

**Negative / Trade-offs**
- Role is a flat string on the `User` model; fine-grained ownership checks (e.g., "can this instructor edit this specific course?") are still done inside the service/repository layer, not the procedure middleware.
- A user can only hold one role at a time. Multi-role scenarios would require schema changes.
