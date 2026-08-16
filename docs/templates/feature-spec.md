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

The definition of done. For AI features, phrase each line so it could become an eval case directly.

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