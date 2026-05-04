# Learnix Documentation

## Structure

```
docs/
├── adr/        Architecture Decision Records — why we chose what we chose
└── specs/      Feature specifications — what each feature does and how
```

## ADRs

| ID | Title | Status |
|----|-------|--------|
| [ADR-001](adr/001-t3-stack.md) | T3 Stack as application foundation | Accepted |
| [ADR-002](adr/002-better-auth.md) | Better Auth over NextAuth.js | Accepted |
| [ADR-003](adr/003-repository-pattern.md) | Repository pattern for data access | Accepted |
| [ADR-004](adr/004-role-based-trpc-procedures.md) | Role-based access via tRPC procedure layer | Accepted |
| [ADR-005](adr/005-split-prisma-schema.md) | Split Prisma schema folder | Accepted |
| [ADR-006](adr/006-sse-ai-course-builder.md) | SSE streaming for AI course builder | Accepted |
| [ADR-007](adr/007-vercel-blob-storage.md) | Vercel Blob for media storage | Accepted |

## Specs

| Feature | Spec |
|---------|------|
| Authentication | [specs/auth.md](specs/auth.md) |
| Course Management | [specs/course-management.md](specs/course-management.md) |
| Student Enrollment | [specs/enrollment.md](specs/enrollment.md) |
| AI Course Builder | [specs/ai-course-builder.md](specs/ai-course-builder.md) |
| Instructor Onboarding | [specs/instructor-onboarding.md](specs/instructor-onboarding.md) |
