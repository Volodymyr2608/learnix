---
argument-hint: [feature slug — optional if obvious from the approved spec]
description: Phase 2 of the spec-gated workflow — turn an approved spec.md into build/plan.md, then STOP for approval
---

You are running **`/plan`**, the second gate of the spec-gated workflow (ADR-021).

Target feature: <feature>$ARGUMENTS</feature> (if empty, use the feature whose spec was just approved).

## Precondition (hard)

There must be an **approved** `docs/specs/features/<slug>/spec.md`. If it does not exist, refuse:

> No approved spec found for this feature. Run `/spec <intent>` first — a plan is never written without
> an approved spec.

Do not invent a spec to get past this gate.

## Steps

1. Read the approved `spec.md` and `docs/constitution.md` (the plan must honor every standing
   constraint — component-folder architecture, OWASP rules, testing strategy).
2. **Ground the plan in real code before writing it** (this is what makes the plan cite true
   file:line anchors instead of guesses):
   - Dispatch the **`feature-dev:code-explorer`** agent to trace the existing execution paths,
     layers, and patterns the feature will touch (routers/services/repositories, related components).
   - Dispatch the **`feature-dev:code-architect`** agent to produce an implementation blueprint from
     those patterns — files to create/modify, data flow, build sequence.
   - Feed both results into the plan as the verified "Codebase anchors" the template asks for.
3. Run `superpowers:writing-plans` against the spec to produce
   `docs/specs/features/<slug>/build/plan.md` from `docs/templates/plan.md`: bite-sized TDD tasks,
   **real code** (no placeholders like "add error handling"), exact file paths, exact commands +
   expected output, and a per-task commit. Include the `## Self-review` mapping every acceptance
   criterion to a task and the `## Final verification` section.
4. Do **not** write any implementation code, create files outside `build/plan.md`, or run mutations.
   (The plan gate hook will block source edits anyway — `/plan` only produces the plan.)

## Gate

End with the plan path and:

> **STOP — review and approve `build/plan.md` before running `/implement`.** No code is written until
> the plan is approved.