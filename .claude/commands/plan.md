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
2. **Ground the plan in real code before writing it** — this is what makes it cite true `file:line`
   anchors instead of guesses. **One** reconnaissance dispatch, not two:
   - Dispatch **`feature-dev:code-explorer`**, scoped to the surfaces `spec.md` names, and ask it
     for exactly the `Codebase anchors` the template wants: the real signatures, patterns and paths
     the tasks will reuse, each with `file:line`.
   - Write the implementation blueprint **yourself** from those anchors. You already hold the spec,
     the constitution and now the anchors; a second cold agent re-reads the codebase to reach the
     same place. `feature-dev:code-architect` has the highest median cost of any dispatch in this
     repo (ADR-030) — reach for it only for genuinely new architecture (a new layer, a new external
     service, a risky migration), and say in the plan why.
3. Run `superpowers:writing-plans` against the spec to produce
   `docs/specs/features/<slug>/build/plan.md` from `docs/templates/plan.md`. The plan is **thin**:
   each task states a contract, the test that proves it, the files it touches, and the acceptance
   criterion it satisfies — **not** the implementation. Do not paste implementation code into the
   plan; the executor is the same model that wrote it, so code in the plan means generating the
   feature twice and letting the two drift. The narrow exception is when the exact form of the code
   *is* what is being approved (a non-trivial migration, the money or crypto path, a guard regex) —
   then mark the task `code included: <reason>`. Include the `## Self-review` mapping every
   acceptance criterion to a task and the `## Final verification` section.
4. **Carry the threat pass into tasks.** Record the `pnpm classify` verdict in the plan's **Track**
   field. If `/spec` produced a `## Security` section, a `security.md`, or security-derived
   acceptance criteria, every control there becomes a **task with its own test** — not a line in a
   "harden later" task, and not an assertion bolted onto an unrelated task. A control the classifier
   named and the plan does not cover is a gap here, not at `/qa`. In particular:
   - An authorization control names the query that enforces it and the test that proves the
     unauthorized caller gets nothing (ADR-017 Rule 2, ADR-023 binding).
   - A new AI surface includes its `GUARDED_ENTRY_POINTS` registration in the same task that adds the
     model call, so `entryPoints.contract.test.ts` never goes red on a later task.
   - A new agent tool includes its authority check (not just its Zod schema) and the denial test.
   - A probabilistic control (guard pattern, classifier, validator) includes an `evals/` row and a
     **false-positive** check on legitimate input, not only a recall check.

   The `## Self-review` mapping must show each security acceptance criterion against its task, the
   same as every other criterion. A control that reaches `/qa` without a task is a process failure
   here, not there.

5. Do **not** write any implementation code, create files outside `build/plan.md`, or run mutations.
   (The plan gate hook will block source edits anyway — `/plan` only produces the plan.)

## Gate

End with the plan path and:

> **STOP — review and approve `build/plan.md` before running `/implement`.** No code is written until
> the plan is approved.