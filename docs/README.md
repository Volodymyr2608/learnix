# Learnix Documentation

## Structure

```
docs/
├── adr/        Architecture Decision Records — why we chose what we chose
├── specs/      Living feature specs (features/) + mission, tech-stack, roadmap, process
└── templates/  feature-spec.md (spec.md) + plan.md (build/plan.md)
```

Security review output is not kept here. A finding that gets fixed becomes acceptance criteria in the
owning feature's `spec.md`; a finding that gets accepted goes into that feature's `security.md` risk
register with its residual impact. Point-in-time review documents are working notes, not a tier of
documentation — the repo records the decision, not the pass that produced it. Reviews are produced by
the `security-auditor` and `llm-security-auditor` agents (see `documentation-process.md` §3d).

See [`docs/specs/documentation-process.md`](specs/documentation-process.md) for the full process —
tiers, `spec.md` format, lifecycle, and [`docs/adr/020-hybrid-documentation-model.md`](adr/020-hybrid-documentation-model.md)
for why it's structured this way.

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
| [ADR-020](adr/020-hybrid-documentation-model.md) | Hybrid Intent + ADR + Harness documentation model | Accepted |
| [ADR-021](adr/021-spec-gated-command-workflow.md) | Spec-gated command workflow | Accepted |
| [ADR-022](adr/022-ai-input-trust-boundary.md) | AI input trust boundary | Accepted |
| [ADR-023](adr/023-chat-route-authorization-binding.md) | Chat-route authorization binds the checked identifier to the acted-on one | Accepted |
| [ADR-024](adr/024-lesson-tutor-authority-boundaries.md) | Lesson tutor authority boundaries | Accepted |
| [ADR-025](adr/025-account-deletion-and-anonymisation.md) | Account deletion and in-place anonymisation | Accepted |
| [ADR-026](adr/026-shared-ai-defence-layers.md) | Shared AI defence layers | Accepted |
| [ADR-027](adr/027-distributed-ai-rate-limiting.md) | Distributed AI rate limiting | Accepted |
| [ADR-028](adr/028-multilingual-ai-guard-coverage.md) | Multilingual AI guard coverage | Accepted |
| [ADR-029](adr/029-error-reporting-projection-funnel.md) | Enrich at the service boundary, capture once through an allowlist projection | Accepted |
| [ADR-030](adr/030-tiered-agentic-development.md) | Decide process ceremony from the diff, and measure what it costs | Accepted |
| [ADR-031](adr/031-eval-fidelity-and-baselines.md) | Evals measure the shipped system, and their numbers survive the run | Accepted |

## Specs

### Constitution

| Doc | Purpose |
|-----|---------|
| [mission.md](specs/mission.md) | Platform purpose, audience, and AI differentiators |
| [tech-stack.md](specs/tech-stack.md) | Technology choices with rationale (links to ADRs) |
| [roadmap.md](specs/roadmap.md) | High-level implementation order by phase |

### Features

Generated index, not hand-maintained: [`docs/specs/features/_index.md`](specs/features/_index.md)
(run `pnpm spec:sync` after adding or editing any `spec.md`). Each row links to a living
`docs/specs/features/<slug>/spec.md`.

### History

Features shipped before 2026-06-23 predate this model and have no living spec — their code and tests
are the record. The retired dated spec folders (`requirements`/`spec`/`plan`/`validation` per
feature) were removed from the tree on 2026-07-30 and remain in git history.
`features/_index.md` is the live source of navigation.

## Spec templates

- **Standard-tier** features: one living doc from [`docs/templates/feature-spec.md`](templates/feature-spec.md)
  → `docs/specs/features/<slug>/spec.md`.
- **Complex-tier** features (money, auth/security, new external service, risky migration): the same
  `spec.md` plus a detailed [`build/plan.md`](templates/plan.md) **and** an ADR — see
  [`docs/templates/README.md`](templates/README.md).

[`docs/specs/documentation-process.md`](specs/documentation-process.md) defines how to decide the
tier and has worked examples for both; [`CLAUDE.md`](../CLAUDE.md) → Development Workflow has the
short version.
