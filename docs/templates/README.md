# Spec templates

Starting points for the four `build/` documents a **complex-tier** feature carries (see
[`docs/specs/documentation-process.md`](../specs/documentation-process.md) §3 for what makes a
feature complex-tier vs. standard vs. trivial). Standard-tier features use
[`feature-spec.md`](./feature-spec.md) instead — a single living doc, no gated stages.

## The four documents

| Stage | File | Answers | Influences |
|-------|------|---------|-----------|
| 1 | [`requirements.md`](./requirements.md) | **What & why** — problem, goals, testable functional requirements, NFRs, out-of-scope | Spec Kit `/specify`, BMAD PRD |
| 2 | [`spec.md`](./spec.md) | **How (design)** — data model, contracts, flow, file list, risks | BMAD Architecture, Spec Kit `/plan`, arc42 |
| 3 | [`plan.md`](./plan.md) | **How (execution)** — bite-sized TDD tasks with real code | superpowers `writing-plans`, BMAD dev stories |
| 4 | [`validation.md`](./validation.md) | **Proof** — automated checks, FR→test traceability, manual scenarios, DoD | BMAD QA gate, test pyramid |

If a feature warrants an architectural decision, also add an ADR in [`../adr/`](../adr/) and link
it from `spec.md`.

## How to use

1. Create the build folder: `docs/specs/features/<slug>/build/`.
2. Copy the four templates into it:
   ```bash
   cp docs/templates/{requirements,spec,plan,validation}.md docs/specs/features/<slug>/build/
   ```
3. Fill them **in order**, one at a time, **pausing for approval between each** — never start the
   next document until the previous is approved. Each builds on the one before it.
4. Strip the `<!-- guidance -->` comment blocks as you go; resolve every
   `[NEEDS CLARIFICATION]` before approving a stage.
5. Once `plan.md` is approved, execute it with `superpowers:subagent-driven-development` (or
   `executing-plans`). Don't run `brainstorming` — the spec is the design.
6. On ship: distill `build/` down into `docs/specs/features/<slug>/spec.md` (Purpose / Functional
   scope / Acceptance criteria / Agent notes only), freeze `build/`, run `pnpm spec:sync`, and write
   an ADR if the decision crosses the three-month test.

## Principles

- **Separation of altitude.** Requirements stay free of tech; design stays free of step-by-step
  build order; the plan carries the code. Each stage has one job.
- **Traceability.** Functional requirements get IDs (`FR1`, `FR2`…) so plan tasks and validation
  checks can reference them. `validation.md` must cover every FR.
- **Testable everything.** A requirement a reviewer can't judge pass/fail is not done. Plan tasks
  are test-first.
- **One source of truth per fact.** Schemas live in `spec.md`, not duplicated in requirements;
  rationale for hard decisions lives in an ADR, not scattered.

See [`docs/specs/_legacy/2026-06-12-payments/`](../specs/_legacy/2026-06-12-payments/) for a worked example.