---
feature: <slug>
status: planned
models: []
depends-on: []
---

## Purpose

Why this feature exists, in business terms. Who needs it and what problem it solves — not how it's
built.

## Functional scope

What the feature does *right now*. Describe current behavior only — no "previously / now" diffing;
git history covers that.

## Acceptance criteria

Applies: [`docs/constitution.md`](../constitution.md) — the standing constraints (structure, style,
error handling, security, testing) are inherited, not retyped here — plus the feature-specific
criteria below.

The definition of done. For AI features, phrase each line so it could become an eval case directly.

## Inputs / Outputs

Trusted vs untrusted inputs and where the boundary is enforced; the output's shape and who consumes
it. Required for any AI surface: an untrusted input and a probabilistic output have a contract that
does not follow from the types, the way an ordinary function's does. Delete for a feature with
neither.

## Edge cases

The cases a reader would otherwise have to discover from the code. Delete if there are none worth
naming — an empty heading is worse than no heading.

## Non-functional requirements

Latency budget (p95), token/cost ceiling, rate limits. Delete if the feature makes no model call and
adds no external I/O.

## Security

Only when the feature has a security or AI surface — otherwise delete this section. Holds the output
of the `/spec` threat pass (`security-auditor` and/or `llm-security-auditor` in `design` mode): the
threats kept, the control answering each, and anything deliberately accepted. Every control here must
also appear as an acceptance criterion above, since that is what `/plan` turns into a task and `/qa`
checks back.

For **complex** tier this moves to a sibling `security.md` (plus `threat-model.md` when warranted) —
see `features/ai-tutor-guardrails/`.

## Agent notes

Anything an agent needs to know that isn't visible from reading the code — non-obvious invariants,
ordering constraints, or gotchas a future change could easily break.