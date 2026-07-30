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

2. **Security audit (complex tier).** If the feature touched money, auth/security, a new external
   service, or a data migration, dispatch the **`security-auditor`** agent for an OWASP/IDOR pass over
   the changed routes, services, and repositories (enforces ADR-017). Resolve High/Critical findings
   before the PR. Skip for standard/trivial work with no security surface.

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

Do not open the PR until review findings are resolved and all three Gate-Docs items are done. Report
the actual command output, not a claim that it passed.