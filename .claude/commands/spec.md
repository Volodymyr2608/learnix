---
argument-hint: [plain-language intent or bug report]
description: Phase 1 of the spec-gated workflow — infer tier, brainstorm, scaffold spec.md, then STOP for approval
---

You are running **`/spec`**, the first gate of the spec-gated workflow (ADR-021). Read
`docs/specs/documentation-process.md` (§3a tier checklist, §4 spec format) and
`docs/constitution.md` (standing non-negotiables) before doing anything.

The intent: <intent>$ARGUMENTS</intent>

## Steps

1. **Classify, don't judge.** Run `pnpm classify` and quote its verdict. `GUARDED` is the complex
   tier — the script names the signal and the files, and that list becomes the audit scope later.
   For anything it does not call guarded, apply §3a questions 2 and 3 (documented behavior changed →
   standard; otherwise trivial). The developer never declares a tier.

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

4. **Threat pass — only on the classifier's verdict.** A control is cheap here and expensive at
   `/qa`, but a pass that re-derives controls the codebase already enforces is pure cost. Read
   `pnpm classify` from step 1 (`documentation-process.md` §3d):

   - **New authority** → dispatch in parallel, each given the spec path, the mode, and the
     classifier's file list as scope:
     - **`security-auditor`** in `design` mode — for a new procedure, route, model, migration,
       environment variable, or anything on the money path.
     - **`llm-security-auditor`** in `design` mode — for a new agent tool, graph node, AI entry
       point, or a new path that renders model-authored text.
   - **Modified control, no new authority** → **no design pass.** Note the control and which auditor
     will check it at `/qa`; the audit happens once, against real code, not twice.
   - **Neither** → **no pass.** Write one line inheriting the controls by reference, naming the
     `security.md` and the control ids they come from.

   Both return controls already phrased as testable lines:
   - Fold them into **Acceptance criteria** — that is what makes `/plan` unable to omit them and
     `/qa` able to check them. For AI surfaces, phrase them so they can become eval rows.
   - For **standard** tier, keep any longer reasoning in a `## Security` section of `spec.md`.
   - For **complex** tier, put it in a sibling `docs/specs/features/<slug>/security.md` (and
     `threat-model.md` when the surface warrants one) — `features/ai-tutor-guardrails/` is the shape
     to copy.
   - Surface each agent's "Decisions needed from the developer" to the user **in this turn**; they are
     scope questions, and answering them after the plan is written is a rewrite.

   Whichever branch you took, say so in one line rather than silently not running it — a skip on the
   record can be argued with, a silent one cannot.

## Gate

End by telling the user the classifier's verdict, the tier, the spec path, which threat agents ran
(or the one-line reason none did), any decisions they surfaced, and:

> **STOP — review and approve `spec.md` before running `/plan`.** Do not write a plan or any code in
> this turn.

Never continue into planning or implementation from `/spec`.