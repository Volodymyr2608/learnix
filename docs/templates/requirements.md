<!--
TEMPLATE · requirements.md (Stage 1 of 4 — the WHAT and WHY)
Influences: GitHub Spec Kit (/specify), BMAD-METHOD (PRD), agentic-execution best practice.

How to use:
  1. Copy the four templates into docs/specs/<YYYY-MM-DD>-<feature>/.
  2. Fill THIS file first. Describe behaviour and outcomes — NOT implementation.
     (No tech stack, schemas, file paths, or library choices here — those live in spec.md.)
  3. Every functional requirement MUST be testable: a reviewer can tell pass from fail.
  4. Mark anything unresolved with **[NEEDS CLARIFICATION: question]** and resolve before approval.
  5. Get explicit approval, THEN move on to spec.md.
Delete this comment block and every <!-- guidance --> note before finalising.
-->

# Requirements: <Feature Name>

> Design in [`spec.md`](./spec.md) · plan in [`plan.md`](./plan.md) · checks in [`validation.md`](./validation.md)<!-- · ADR in ../../adr/NNN-<slug>.md if one is warranted -->

## Status: <planned | in progress | delivered> — <roadmap ref, e.g. P0.2>

<!-- Metadata: date · author · stakeholders consulted. -->

## Problem

<!-- The concrete pain, today, with evidence. What can't be done / what's broken / what it costs.
     Cite the current code paths that establish the gap (file:line) so the problem is verifiable. -->

## Goal

<!-- The desired end state in 2–5 bullets. Outcomes, not features. A non-author should be able to
     judge "did we achieve this?" from these lines alone. -->

## Scope decisions (locked)

<!-- Decisions already made WITH the stakeholder, each with a one-line rationale. These are the
     guardrails that keep spec.md honest. Number them so spec/plan can reference "decision #3". -->

1. **<Decision>:** <what was chosen> — <why / what it rules out>.
2. ...

## Assumptions & constraints

<!-- Things taken as true (single currency, runtime, existing infra) and hard constraints
     (deadline, compliance, must-reuse X). Surface assumptions so they can be challenged. -->

- ...

## Functional requirements

<!-- The heart of the doc. One row per requirement, grouped by surface/epic. Each needs an ID
     (FR1, FR2…) so plan.md tasks and validation.md tests can trace back to it. The "Behaviour"
     must be acceptance-testable (Given/When/Then is encouraged for non-trivial rules). -->

### <Group / epic, e.g. Purchase & access>

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR1 | <where> | <observable behaviour — what the system does, the rule, the edge> |
| FR2 | <where> | <...> |

<!-- Repeat a table per group. Keep every FR independently verifiable. -->

## Non-functional requirements

<!-- Only the ones that actually bite this feature. Drop rows that don't apply. -->

| Aspect | Requirement |
|--------|-------------|
| Security / authz | <role gating, ownership checks, secrets, PCI/PII handling> |
| Performance | <latency/throughput budget, N+1 limits> |
| Reliability | <idempotency, retries, failure isolation> |
| Accessibility / UX | <keyboard, states, error messaging> |
| Observability | <what must be logged/traced/measured> |
| Data / privacy | <retention, what is NOT stored> |

## Success metrics

<!-- How we'll know it worked in production. Quantify where possible. -->

- ...

## Out of scope (deferred)

<!-- Explicitly NOT in this feature, so reviewers don't expect it and plan.md doesn't sprawl. -->

- ...

## Open questions

<!-- Anything still [NEEDS CLARIFICATION]. The doc is not approvable while this list has blockers. -->

- ...