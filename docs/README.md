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
| [ADR-006](adr/006-sse-ai-course-builder.md) | SSE streaming as AI transport | Accepted |
| [ADR-007](adr/007-vercel-blob-storage.md) | Vercel Blob for media storage | Accepted |
| [ADR-008](adr/008-langchain-agent-pattern.md) | LangChain agent + tools pattern for AI features | Accepted |
| [ADR-009](adr/009-video-delivery.md) | Video delivery strategy | Accepted |
| [ADR-010](adr/010-domain-error-mapping.md) | Domain error to tRPC error mapping | Accepted |

## Specs

### Constitution

| Doc | Purpose |
|-----|---------|
| [mission.md](specs/mission.md) | Platform purpose, audience, and AI differentiators |
| [tech-stack.md](specs/tech-stack.md) | Technology choices with rationale (links to ADRs) |
| [roadmap.md](specs/roadmap.md) | High-level implementation order by phase |

### Features — implemented

| Feature | Spec |
|---------|------|
| Authentication | [specs/auth.md](specs/auth.md) |
| Instructor Onboarding | [specs/instructor-onboarding.md](specs/instructor-onboarding.md) |
| Course Management | [specs/course-management.md](specs/course-management.md) |
| Student Enrollment | [specs/enrollment.md](specs/enrollment.md) |
| AI Course Builder | [specs/ai-course-builder.md](specs/ai-course-builder.md) |

### Features — planned

| Feature | Spec | Roadmap phase |
|---------|------|--------------|
| AI Lesson Assistant | [specs/ai-lesson-assistant.md](specs/ai-lesson-assistant.md) | Phase 8 |
| AI Quiz Generator | [specs/ai-quiz-generator.md](specs/ai-quiz-generator.md) | Phase 9 |
