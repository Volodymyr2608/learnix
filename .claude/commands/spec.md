---
argument-hint: [plain-language intent or bug report]
description: Phase 1 of the spec-gated workflow — infer tier, brainstorm, scaffold spec.md, then STOP for approval
---

You are running **`/spec`**, the first gate of the spec-gated workflow (ADR-021). Read
`docs/specs/documentation-process.md` (§3a tier checklist, §4 spec format) and
`docs/constitution.md` (standing non-negotiables) before doing anything.

The intent: <intent>$ARGUMENTS</intent>

## Steps

1. **Infer the tier** using the §3a checklist (complex → standard → trivial, stop at first yes). The
   developer never declares a tier; you infer it from what the change actually touches.

2. **If trivial/fix** (no change to any feature's documented behavior — bug fix, refactor, internal
   correctness): say so explicitly, do **not** create a spec or folder, and route straight to
   `superpowers:systematic-debugging` + `superpowers:test-driven-development`. Trivial work skips the
   rest of the chain. Because trivial fixes legitimately edit source without a plan, open the gate
   marker so the `plan-gate` hook allows it (this keeps skipping a *conscious* act, not a silent one):
   ```
   printf 'branch=%s\ntier=trivial\n' "$(git rev-parse --abbrev-ref HEAD)" > .claude/.active-plan
   ```

3. **If standard or complex:**
   - If a `docs/specs/features/<slug>/spec.md` already covering this work **already exists**, skip
     `brainstorming` (the spec is the design) — read it and confirm scope with the user instead.
   - Otherwise run `superpowers:brainstorming` to pin scope (boundaries, what's explicitly out).
   - Create `docs/specs/features/<slug>/spec.md` from `docs/templates/feature-spec.md` with
     `status: planned`. Fill Purpose / Functional scope / Acceptance criteria / Agent notes per §4. For
     AI features, phrase each acceptance criterion so it could become an eval case directly.
   - For **complex** work (money / auth / new external service / risky migration) note that an ADR will
     be required at the `/qa` gate.

## Gate

End by telling the user the tier, the spec path, and:

> **STOP — review and approve `spec.md` before running `/plan`.** Do not write a plan or any code in
> this turn.

Never continue into planning or implementation from `/spec`.