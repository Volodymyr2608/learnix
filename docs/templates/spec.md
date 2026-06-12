<!--
TEMPLATE · spec.md (Stage 2 of 4 — the HOW, at the design level)
Influences: BMAD-METHOD (Architecture doc), GitHub Spec Kit (/plan), arc42, ADR practice.

How to use:
  1. Fill this ONLY after requirements.md is approved. Every design choice here must trace to a
     requirement or scope decision in requirements.md — no new scope sneaks in.
  2. This is design, not task breakdown. Describe the shape of the solution (models, contracts,
     flow, file responsibilities), not step-by-step build order (that's plan.md).
  3. If a genuine architectural decision is made here, write an ADR (docs/adr/NNN-<slug>.md) and
     link it — don't bury the rationale in this file.
  4. Get explicit approval, THEN move on to plan.md.
Delete this comment block and every <!-- guidance --> note before finalising.
-->

# Spec: <Feature Name>

> Requirements in [`requirements.md`](./requirements.md) · plan in [`plan.md`](./plan.md) · checks in [`validation.md`](./validation.md)<!-- · ADR: ../../adr/NNN-<slug>.md -->

## Approach (overview)

<!-- 3–6 sentences: the chosen design and WHY it satisfies the requirements. Name the key trade-off
     and the alternative you rejected (link the ADR if there is one). -->

## Architectural decisions referenced

<!-- The existing ADRs/patterns this feature must follow, each with one line on what it dictates. -->

- **ADR-XXX** — <what it constrains here>.
- ...

## Data model

<!-- New + modified persistence. Show the actual schema (e.g. Prisma blocks). For migrations,
     state the data-backfill/destructive steps explicitly (order matters). -->

### `prisma/schema/<file>.prisma` (<new | modified>)

```prisma
// model(s), enums, indexes, @@map
```

<!-- Note any backfill / column drops and the order they must run in. -->

## API & contracts

<!-- The interface surface. tRPC procedures (and their procedure type / role gating), HTTP routes,
     DTOs. Make authz explicit per endpoint — who can call it. -->

| Procedure / route | Type / auth | Input → Output | Notes |
|-------------------|-------------|----------------|-------|
| `<router.method>` | `<studentProcedure | … | route>` | `<In>` → `<Out>` | <idempotency, side-effects> |

## Component / data flow

<!-- An ASCII flow (or sequence) showing the happy path and the key branches/failure paths.
     Pin down the single sources of truth (e.g. one idempotent reconcile point). -->

```
<flow diagram>
```

## File list

<!-- The decomposition. One line of responsibility per file — this is where plan.md's tasks come
     from. Keep files focused (one clear responsibility each). -->

**New**
- `<path>` — <responsibility>.

**Modified**
- `<path>` — <what changes and why>.

## Cross-cutting concerns

<!-- Only what applies. Tie each back to the relevant NFR in requirements.md. -->

- **Security / authz:** <role enforcement, ownership/IDOR checks, secret handling>.
- **Error handling:** <typed domain errors → transport mapping; user-facing messages>.
- **Idempotency / consistency:** <dedupe keys, reconcile strategy, transactions>.
- **Observability:** <logs/traces/metrics to add>.
- **Performance:** <query shape, indexing, caching, batching>.

## Risks & mitigations

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| <risk> | <L/M/H> | <how we de-risk; fallback> |

## Rollout / migration

<!-- Env vars to add, migration ordering, feature-flag/ramp, backfill scripts, manual ops steps,
     and how to undo. Omit if trivial. -->

- ...