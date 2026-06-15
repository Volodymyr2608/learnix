# Learnix Documentation

## Structure

```
docs/
├── adr/        Architecture Decision Records — why we chose what we chose
├── specs/      Feature specifications — what each feature does and how
└── templates/  Starting-point templates for the 4-file gated spec workflow
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
| [ADR-011](adr/011-component-folder-architecture.md) | Component folder architecture | Accepted |
| [ADR-012](adr/012-pgvector-embeddings.md) | pgvector for embeddings and semantic retrieval | Accepted |
| [ADR-013](adr/013-langsmith-tracing-evals.md) | LangSmith for tracing and offline evals | Accepted |
| [ADR-014](adr/014-n8n-lifecycle-automations.md) | n8n for lifecycle automation webhooks | Accepted |
| [ADR-015](adr/015-resend-react-email-outbox.md) | Resend + React Email for transactional email | Accepted |
| [ADR-016](adr/016-langgraph-course-builder.md) | LangGraph-based AI course builder | Accepted |
| [ADR-017](adr/017-owasp-security-rules.md) | OWASP security rules for Learnix | Accepted |
| [ADR-018](adr/018-testing-strategy-ci.md) | Testing strategy and CI gating | Accepted |
| [ADR-019](adr/019-payments.md) | Payments (paid enrollment, commission & instructor payouts) | Accepted |

## Specs

### Constitution

| Doc | Purpose |
|-----|---------|
| [mission.md](specs/mission.md) | Platform purpose, audience, and AI differentiators |
| [tech-stack.md](specs/tech-stack.md) | Technology choices with rationale (links to ADRs) |
| [roadmap.md](specs/roadmap.md) | High-level implementation order by phase |

### Features — delivered

| Feature | Spec |
|---------|------|
| Authentication & roles | [2026-05-04-auth/](specs/2026-05-04-auth/requirements.md) |
| Instructor onboarding | [2026-05-04-instructor-onboarding/](specs/2026-05-04-instructor-onboarding/requirements.md) |
| Course management (CRUD, publish, uploads) | [2026-05-04-course-management/](specs/2026-05-04-course-management/requirements.md) |
| AI course builder (LangGraph) | [2026-05-22-langgraph-course-builder/](specs/2026-05-22-langgraph-course-builder/requirements.md) |
| Student course learning experience | [2026-05-07-student-course-learning/](specs/2026-05-07-student-course-learning/requirements.md) |
| Student enrollment | [2026-05-04-enrollment/](specs/2026-05-04-enrollment/requirements.md) |
| AI lesson assistant | [2026-05-05-ai-lesson-assistant/](specs/2026-05-05-ai-lesson-assistant/requirements.md) |
| AI quiz generator | [2026-05-06-ai-quiz-generator/](specs/2026-05-06-ai-quiz-generator/requirements.md) |
| Semantic search & recommendations | [2026-05-08-semantic-search-recommendations/](specs/2026-05-08-semantic-search-recommendations/requirements.md) |
| Personalized learning path | [2026-05-12-personalized-learning-path/](specs/2026-05-12-personalized-learning-path/requirements.md) |
| Lesson auto-summary & insights | [2026-05-08-lesson-auto-summary/](specs/2026-05-08-lesson-auto-summary/requirements.md) |
| Lifecycle email (Resend + React Email) | [2026-05-12-resend-react-email/](specs/2026-05-12-resend-react-email/requirements.md) |
| n8n lifecycle automations | [2026-05-12-n8n-lifecycle-automations/](specs/2026-05-12-n8n-lifecycle-automations/requirements.md) |
| Testing strategy & CI gating | [2026-05-24-testing-strategy/](specs/2026-05-24-testing-strategy/requirements.md) |
| Auth completion (forgot-password, settings) | [2026-06-11-auth-completion/](specs/2026-06-11-auth-completion/requirements.md) |

### Features — in progress

| Feature | Spec |
|---------|------|
| Payments & monetization (Stripe) | [2026-06-12-payments/](specs/2026-06-12-payments/requirements.md) |

### Features — planned

| Feature | Spec |
|---------|------|
| Lesson rich text editor (WYSIWYG) | [2026-05-09-lesson-rich-text-editor/](specs/2026-05-09-lesson-rich-text-editor/requirements.md) |
| Instructor insights agent | [2026-05-08-instructor-insights-agent/](specs/2026-05-08-instructor-insights-agent/requirements.md) |

## Spec templates

New feature specs live in `docs/specs/<YYYY-MM-DD>-<feature>/`. Each folder holds four
documents produced in order with a manual approval gate between each. Start from the templates:

```bash
cp docs/templates/{requirements,spec,plan,validation}.md docs/specs/<YYYY-MM-DD>-<feature>/
```

See [`docs/templates/README.md`](templates/README.md) for the full workflow and [`CLAUDE.md`](../CLAUDE.md) → Development Workflow for the rules.
