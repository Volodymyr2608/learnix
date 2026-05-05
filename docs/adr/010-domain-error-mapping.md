# ADR-010: Domain Error to tRPC Error Mapping

- **Status**: Accepted
- **Date**: 2026-05

## Context

Eight domain error classes existed across the service layer (`AuthError`, `CourseError`, `CourseAIError`, `EnrollmentError`, `InstructorError`, `LessonError`, `SectionError`, `UserError`). Each extended `Error` directly with an inconsistent constructor shape.

Four problems made this hard to maintain:

**1. No consistent tRPC code on domain errors.**
`EnrollmentError` alone carried a `code` field (`"BAD_REQUEST" | "NOT_FOUND"`). The other seven classes did not, so routers had no way to read the intended HTTP semantic and always fell back to `BAD_REQUEST` — even for "not found" errors.

**2. Routers repeated the same catch boilerplate on every procedure.**
Every procedure wrapped its service call in the same three-branch pattern, and `courseRouter` alone had 25+ `throw new TRPCError(...)` calls:

```ts
} catch (error: unknown) {
  if (error instanceof TRPCError) throw error;
  if (error instanceof Error) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }
  throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown error" });
}
```

**3. Type-unsafe `error.message` access.**
Several procedures used `// @ts-expect-error` to access `error.message` because `error` was typed as `unknown`.

**4. A bug in `ai.ts`.**
`setCourseGenerationStatus` threw an explicit `TRPCError({ code: "NOT_FOUND" })` inside a try block whose catch re-threw everything as `BAD_REQUEST`, silently swallowing the intended code.

## Decision

### 1. `DomainError` abstract base class

```ts
// server/services/base/base.errors.ts
import type { TRPCError } from "@trpc/server";

type TRPCCode = ConstructorParameters<typeof TRPCError>[0]["code"];

export abstract class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: TRPCCode = "INTERNAL_SERVER_ERROR",
    public readonly cause?: unknown,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}
```

The `TRPCCode` type is derived directly from `TRPCError`'s constructor so it always stays in sync with tRPC without importing an internal subpath.

### 2. All eight error classes extend `DomainError`

Each class is now a single line — no constructor override needed since `DomainError` already exposes `(message, code, cause, context)`:

```ts
// example — all eight follow this shape
export class CourseError extends DomainError {}
```

`EnrollmentError`'s previous narrow `"BAD_REQUEST" | "NOT_FOUND"` union is replaced by the full `TRPCCode` type, which is a superset. Existing throw sites that passed `"NOT_FOUND"` continue to work unchanged.

### 3. `handleServiceError` helper

```ts
// server/utils/handleServiceError.ts
export function handleServiceError(error: unknown): never {
  if (error instanceof TRPCError) throw error;

  if (error instanceof DomainError) {
    throw new TRPCError({ code: error.code, message: error.message, cause: error.cause });
  }

  if (error instanceof Error) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  }

  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred" });
}
```

Priority: re-throw existing `TRPCError` as-is → map `DomainError` using its `code` → map plain `Error` to `INTERNAL_SERVER_ERROR` → catch-all.

### 4. Service throw sites updated

All throw sites were updated to the new four-parameter signature. Internal failures (database errors, transaction failures) use `"INTERNAL_SERVER_ERROR"`; business logic failures use the appropriate semantic code:

```ts
// internal failure — wraps a repository exception
throw new CourseError("Failed to create course", "INTERNAL_SERVER_ERROR", error, { dto });

// business logic — resource does not exist
throw new CourseError("Course not found", "NOT_FOUND");
```

### 5. Router catch blocks replaced

Every catch block in all four routers (`course`, `ai`, `instructor`, `user`) was replaced with a single `handleServiceError(error)` call. The `setCourseGenerationStatus` bug was also fixed: the `NOT_FOUND` guard now sits outside the try block so it cannot be caught and re-wrapped.

## Consequences

**Positive**
- Domain error code is set at the service layer (closest to the reason), not guessed in the router.
- Router handlers shrink from ~10 lines of catch boilerplate to one call.
- `NOT_FOUND`, `CONFLICT`, `FORBIDDEN`, and other semantic codes are now expressible by any service.
- `handleServiceError` is the single place to add cross-cutting behaviour (Sentry, structured logging) in the future.
- No more `// @ts-expect-error` on error access.

**Negative / Trade-offs**
- Service throw sites must now explicitly choose a tRPC code. An omitted code defaults to `"INTERNAL_SERVER_ERROR"`, which is a reasonable safe default but requires awareness when adding new throws.
- `EnrollmentError`'s constructor no longer restricts the `code` argument to `"BAD_REQUEST" | "NOT_FOUND"`. The full `TRPCCode` union is broader — callers are responsible for using a sensible code.
