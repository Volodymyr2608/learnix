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

4. **Threat pass — design time, before the plan exists.** A control is cheap here and expensive at
   `/qa`. Decide from what the drafted spec actually touches, and dispatch in parallel:
   - **`security-auditor`** in `design` mode — when the feature touches authentication, authorization,
     roles, money, personal data, file upload, an external service, or adds any new `app/api/**` route
     or tRPC procedure.
   - **`llm-security-auditor`** in `design` mode — when the feature adds or changes a model call, a
     prompt, an agent tool, a RAG/embedding path, or renders model-authored text.

   Pass each agent the spec path and the mode explicitly. Both return controls already phrased as
   testable lines:
   - Fold them into **Acceptance criteria** — that is what makes `/plan` unable to omit them and
     `/qa` able to check them. For AI surfaces, phrase them so they can become eval rows.
   - For **standard** tier, keep any longer reasoning in a `## Security` section of `spec.md`.
   - For **complex** tier, put it in a sibling `docs/specs/features/<slug>/security.md` (and
     `threat-model.md` when the surface warrants one) — `features/ai-tutor-guardrails/` is the shape
     to copy.
   - Surface each agent's "Decisions needed from the developer" to the user **in this turn**; they are
     scope questions, and answering them after the plan is written is a rewrite.

   If neither trigger applies, say so in one line — "no security or AI surface, threat pass skipped" —
   rather than silently not running it.

## Gate

End by telling the user the tier, the spec path, which threat agents ran (or why neither did), any
decisions they surfaced, and:

> **STOP — review and approve `spec.md` before running `/plan`.** Do not write a plan or any code in
> this turn.

Never continue into planning or implementation from `/spec`.