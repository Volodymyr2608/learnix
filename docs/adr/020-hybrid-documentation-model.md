# ADR-020: Hybrid Intent + ADR + Harness Documentation Model

- **Status**: Accepted
- **Date**: 2026-06-23

## Context

The prior process required a 4-document gated spec (`requirements → spec → plan → validation`) for
every feature, in a dated folder (`docs/specs/<YYYY-MM-DD>-<feature>/`). After ~32 features (now 36) this
produced: a large amount of documentation an agent has to scan to find anything; duplicated
information across `requirements`/`spec`/`plan`; drift between code and docs once a feature shipped
and kept evolving; and high maintenance cost for changes that touched multiple existing features.

Two pure alternatives were considered before settling on a hybrid.

**Pure Spec-Driven Development (SDD)** — the written spec is the primary artifact; code is a
translation of an approved design.
- Strengths: cheap design review before code is written; forces upfront thinking; works well for
  complex changes; builds institutional/business memory.
- Weaknesses: docs rot quickly; a spec never *guarantees* the code matches it; heavy ceremony even
  for small changes; scales poorly as an agent's primary navigation aid.

**Pure Harness-first** — invest entirely in executable verification (types, tests, evals, CI,
verification skills) and drop prose specs.
- Strengths: fast iteration; self-correcting agents; verification can never go stale because it's
  enforced on every run; scales to autonomous/parallel agents.
- Weaknesses: tests answer "does it work," never "why does this exist"; a weak harness creates false
  confidence; reviewing product intent after the fact is expensive; architectural rationale has
  nowhere to live.

## Decision

Adopt a **hybrid model** that splits source-of-truth three ways instead of picking one:

```
Intent      → Living spec.md   (why a feature exists, what it's supposed to do)
Decisions   → ADR              (why this architecture/design, not an alternative)
Correctness → Harness          (does it actually work, enforced continuously)
```

Each artifact stays thin and responsible only for what the other two cannot express. A passing test
suite doesn't explain why a feature exists; a spec doesn't guarantee the code matches it; an ADR
doesn't tell you whether the decision is still correctly implemented today.

This generalizes a pattern this repo already used informally — ADR-016 holds the *why* of the
LangGraph course-builder shape, `CLAUDE.md` describes its current behavior, and the harness (evals +
tests) enforces correctness. This ADR makes that split deliberate and applies it to every feature,
not only the ones that happened to get an ADR.

Process tiers (how much of the three artifacts a given change needs), the `spec.md` format, lifecycle
states, `_index.md` generation, and worked examples are operational mechanics and live in
`docs/specs/documentation-process.md` rather than here — that document is expected to change as the
process is used in practice; this ADR records the underlying decision, which should not need to.

The three-month rule governs when a decision earns an ADR at all: if, three months from now, someone
asking "why X and not Y" would need a real answer, write one. Routine implementation choices don't
qualify — including, by this same rule, most day-to-day edits to `documentation-process.md` itself.

## Consequences

**Positive:**
- Less documentation an agent has to scan to act — most changes need zero or one file touched.
- Verification can't go stale (harness runs every time); business intent has a stable place to live
  (`spec.md`) without competing with implementation narrative.
- Architectural memory persists in ADRs, decoupled from the spec lifecycle of any one feature.

**Negative / accepted tradeoffs:**
- Cross-feature drift is reduced, not eliminated — a change touching three features still requires a
  reviewer to remember to update three `spec.md` files; nothing automatically enforces this (the
  "Gate Docs" review step is the only mitigation, see `documentation-process.md` §7).
- Whether a change needs a spec, an ADR, both, or neither is a judgment call at the boundary —
  addressed operationally (`documentation-process.md` §3a), not solved structurally here.
- Lifecycle uses `stable` rather than a terminal `done`, since most features here keep getting
  revisited and a terminal status would misrepresent that.

## Alternatives considered

- **Pure SDD** — rejected: ceremony cost doesn't scale with the number of features or with
  agent-driven development, where docs go stale faster than a human-only team would produce them.
- **Pure Harness** — rejected: this codebase's harness coverage is currently uneven (strong on
  repositories/lib/core services, weak on routers and components), and even at full coverage, tests
  cannot express *why* a feature exists — which matters for product and architectural review.
- **Status quo (dated 4-doc SDD per feature)** — rejected: already producing the drift and bloat
  described in Context; no longer matches how agents navigate the repo.

## References

- `docs/specs/documentation-process.md` — operational mechanics: tiers, `spec.md` format, lifecycle,
  `_index.md` generation, worked examples, rollout checklist.
- ADR-016 (LangGraph course builder) — the pre-existing instance of this same Intent/Decision/Harness
  split, generalized here.