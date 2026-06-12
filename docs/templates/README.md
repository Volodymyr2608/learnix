# Spec templates

Starting points for the four documents every feature spec carries. They encode the gated,
spec-driven workflow defined in [`CLAUDE.md`](../../CLAUDE.md) → **Development Workflow**.

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

1. Create the feature folder: `docs/specs/<YYYY-MM-DD>-<feature>/`.
2. Copy the four templates into it:
   ```bash
   cp docs/templates/{requirements,spec,plan,validation}.md docs/specs/<YYYY-MM-DD>-<feature>/
   ```
3. Fill them **in order**, one at a time, **pausing for approval between each** — never start the
   next document until the previous is approved. Each builds on the one before it.
4. Strip the `<!-- guidance -->` comment blocks as you go; resolve every
   `[NEEDS CLARIFICATION]` before approving a stage.
5. Once `plan.md` is approved, execute it with `superpowers:subagent-driven-development` (or
   `executing-plans`). Don't run `brainstorming` — the spec is the design.

## Principles

- **Separation of altitude.** Requirements stay free of tech; design stays free of step-by-step
  build order; the plan carries the code. Each stage has one job.
- **Traceability.** Functional requirements get IDs (`FR1`, `FR2`…) so plan tasks and validation
  checks can reference them. `validation.md` must cover every FR.
- **Testable everything.** A requirement a reviewer can't judge pass/fail is not done. Plan tasks
  are test-first.
- **One source of truth per fact.** Schemas live in `spec.md`, not duplicated in requirements;
  rationale for hard decisions lives in an ADR, not scattered.

See [`docs/specs/2026-06-12-payments/`](../specs/2026-06-12-payments/) for a worked example.