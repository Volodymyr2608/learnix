# ADR-003: Repository Pattern for Data Access

- **Status**: Accepted
- **Date**: 2025-11

## Context

tRPC routers calling Prisma directly leads to duplicated query logic, hard-to-test service code, and no clear boundary between transport and persistence.

## Decision

Introduce a three-layer server architecture: **routers → services → repositories**.

All Prisma access goes through `BaseRepository` (`server/repositories/base/base.repository.ts`), a generic abstract class parameterised on the Prisma model. Domain repositories extend it and add model-specific queries.

## Structure

```
server/
├── api/routers/      tRPC routers — input validation, auth checks, error mapping
├── services/         Business logic — orchestrates repositories, throws domain errors
└── repositories/     Data access — wraps Prisma, handles soft-delete, pagination
```

## Consequences

**Positive**
- `BaseRepository` provides `findOne`, `findFirst`, `findMany`, `create`, `bulkCreate`, `update`, `bulkUpdate`, `updateMany`, `delete`, `bulkDelete`, `deleteMany`, `count`, `aggregate`, `paginate`, `restore`, and `transaction` — all with soft-delete support when `isSoftDelete = true`.
- Soft-delete is transparent: `buildWhere` automatically appends `{ deletedAt: null }` when the flag is set.
- Services throw typed domain errors (e.g., `CourseError`, `EnrollmentError`) that routers catch and map to `TRPCError` codes.
- `transaction()` delegates to `db.$transaction`, keeping transaction scope at the service level.

**Negative / Trade-offs**
- The generic typing in `BaseRepository` is complex (`Prisma.Args`, `Prisma.Result`). Changes to Prisma versions require verifying the generics still resolve correctly.
- For queries that require complex joins or aggregations (e.g., `getPublishedCourse`), repositories still need hand-written methods — the base only covers the common CRUD surface.
