---
argument-hint: [feature slug — optional if obvious from the current branch]
description: Phase 4 of the spec-gated workflow — code review + Gate Docs DoD, then open the PR
---

You are running **`/qa`**, the final gate of the spec-gated workflow (ADR-021). Borrowed from BMAD's
QA stage: nothing merges without an explicit review + docs gate.

Target feature: <feature>$ARGUMENTS</feature> (if empty, infer from the current branch / changed specs).

## Steps

1. **Code review.** Run `superpowers:requesting-code-review` over the branch. Resolve real findings
   before proceeding (use `superpowers:receiving-code-review` for technical rigor on the feedback).

2. **Security audit.** Triggered by surface, not by tier — standard-tier work adds most of the
   routes. Dispatch in parallel, each in `audit` mode:
   - **`security-auditor`** — if the branch touched authentication, authorization, roles, money,
     personal data, file upload, an external service, raw SQL, or added/changed any `app/api/**`
     route or tRPC procedure. Enforces ADR-017.
   - **`llm-security-auditor`** — if the branch touched a prompt, a model call, an agent tool, a
     RAG/embedding path, or a component rendering model-authored text. Enforces ADR-022/023/024.

   **Close the loop with the design pass:** give each agent the feature's `## Security` section or
   `security.md` from `/spec` and require it to report, per control, *implemented / missing /
   changed*. A control that was specified at `/spec` and is absent in the code is a blocking finding
   regardless of severity — that is the whole point of designing it up front.

   Resolve Critical/High before the PR. For Medium/Low, either fix or record them explicitly as
   accepted risks in the feature's `security.md` (the `ai-tutor-guardrails` S13 register is the shape)
   — an unrecorded "we'll get to it" is how a known gap becomes an unknown one. If neither agent
   applies, say so in one line.

3. **Gate Docs (DoD)** — from `documentation-process.md` §7, a PR doesn't close without all three.
   Dispatch the **`docs-updater`** agent to do this pass so it isn't skipped:
   - `spec.md` updated: flip `status → stable` and refresh any Acceptance Criteria that changed during
     implementation. The spec must describe what was *actually* built, not the original guess.
   - `pnpm spec:sync` run, the regenerated `docs/specs/features/_index.md` diff committed.
   - An **ADR** written (`docs/adr/NNN-<slug>.md`) **if** the change passes the 3-month test — touches
     money, auth/security, a new external service, or a risky/expensive migration. Routine
     implementation choices don't qualify.

4. **Verify before claiming done.** Use `superpowers:verification-before-completion`: run `pnpm check`,
   `pnpm typecheck`, and the relevant tests, and confirm green output before asserting success.

5. **Open the PR** with `superpowers:finishing-a-development-branch`, then clear the gate marker:
   `rm -f .claude/.active-plan` (the feature's work is done; a new feature starts the chain again).

## Gate

Do not open the PR until review findings are resolved, every design-time control is accounted for
(implemented or explicitly accepted in writing), and all three Gate-Docs items are done. Report the
actual command output, not a claim that it passed.