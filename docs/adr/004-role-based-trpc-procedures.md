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

## Router input conventions

### Input schema placement

| Input complexity | Where to define |
|---|---|
| Single scalar field (e.g., an id) | `Schema.shape.field` inline in the router |
| Multi-field or nested object | Named Zod DTO in `server/entities/<domain>/index.ts` |

**Rule:** Any `.input(...)` that needs more than one field, or that an inline `z.object({...})` would make the router harder to read, must be extracted to a named DTO in the corresponding entities file.

### DTO file conventions

- File: `server/entities/<domain>/index.ts`
- Export the Zod schema and its inferred TypeScript type under the **same name**:

```ts
export const QuizSubmitDto = z.object({ ... });
export type QuizSubmitDto = z.infer<typeof QuizSubmitDto>;
```

- DTOs used only inside the entities file (helpers for composing a larger DTO) are kept unexported.
- Router imports DTOs by name; it never re-defines or wraps them inline.

### Handler structure

Every handler follows the same three-line shape — no extra nesting:

```ts
procedureName: someRoleProcedure
  .input(InputDto)
  .query/mutation(async ({ ctx, input }) => {
    try {
      return await someService.method(input, ctx.session.user.id);
    } catch (error) {
      handleServiceError(error);
    }
  }),
```

Routers delegate immediately to the service. No business logic, no repository calls, and no second `try/catch` inside the handler.

## Consequences

**Positive**
- Role enforcement is co-located with the tRPC init, not scattered across individual router handlers.
- Adding a new role requires one additional export from `trpc.ts`.
- TypeScript narrows `ctx.session.user` to non-nullable after `protectedProcedure`, eliminating null-checks inside handlers.

**Negative / Trade-offs**
- Role is a flat string on the `User` model; fine-grained ownership checks (e.g., "can this instructor edit this specific course?") are still done inside the service/repository layer, not the procedure middleware.
- A user can only hold one role at a time. Multi-role scenarios would require schema changes.
