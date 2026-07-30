# Spec templates

Two templates, one per document a feature carries (see
[`docs/specs/documentation-process.md`](../specs/documentation-process.md) §3 for the trivial /
standard / complex tiers):

| File | Produces | Answers | Influences |
|------|----------|---------|-----------|
| [`feature-spec.md`](./feature-spec.md) | `features/<slug>/spec.md` | **Why & what** — Purpose, Functional scope, Acceptance criteria, Agent notes | the living-spec model (ADR-020) |
| [`plan.md`](./plan.md) | `features/<slug>/build/plan.md` | **How (execution)** — bite-sized TDD tasks with real code, exact paths, commits, and a final verification section | superpowers `writing-plans`, BMAD dev stories |

The earlier 4-document flow (`requirements.md → spec.md → plan.md → validation.md`) is retired:
problem/scope now lives in the spec's Purpose/Functional scope, and verification lives in the plan's
per-task tests and its `## Final verification` section.

If a feature warrants an architectural decision (the three-month test in `documentation-process.md`
§5), also add an ADR in [`../adr/`](../adr/) and link it from `spec.md`.

## How to use

1. **Spec** — create `docs/specs/features/<slug>/spec.md` from `feature-spec.md`. For standard-tier
   work run `brainstorming` first to pin scope; for complex tier capture the design here too.
2. **Plan** — create `docs/specs/features/<slug>/build/plan.md` from `plan.md`, produced with the
   `writing-plans` skill: bite-sized TDD tasks with real code and exact file paths. Get it approved
   **before** writing implementation code.
3. Execute the approved plan with `superpowers:subagent-driven-development` (or `executing-plans`).
   Don't run `brainstorming` once the spec exists — the spec is the design.
4. On ship: keep `spec.md` as the living doc (flip `status` to `stable`), freeze `build/plan.md`, run
   `pnpm spec:sync`, and write an ADR if the decision crosses the three-month test.

## Principles

- **Separation of altitude.** The spec carries why/what; the plan carries the code and build order.
  Each has one job.
- **Testable everything.** An acceptance criterion a reviewer can't judge pass/fail is not done. Plan
  tasks are test-first, and each maps back to a line of the spec's Acceptance criteria.
- **One source of truth per fact.** Schemas and behavior live in `spec.md`; rationale for hard
  decisions lives in an ADR, not scattered.

See [`docs/specs/features/ai-input-trust-boundary/`](../specs/features/ai-input-trust-boundary/) for a
worked example of the current two-document flow: a living `spec.md` alongside its `build/plan.md`.