---
argument-hint: [feature slug — optional if obvious from the current branch]
description: Phase 4 of the spec-gated workflow — code review + Gate Docs DoD, then open the PR
---

You are running **`/qa`**, the final gate of the spec-gated workflow (ADR-021). Borrowed from BMAD's
QA stage: nothing merges without an explicit review + docs gate.

Target feature: <feature>$ARGUMENTS</feature> (if empty, infer from the current branch / changed specs).

## Steps

1. **One code review, with a mandate.** Run `superpowers:requesting-code-review` over the branch —
   its scope is **correctness, conventions and readability, not security**. Resolve real findings
   before proceeding (use `superpowers:receiving-code-review` for technical rigor on the feedback).
   Do **not** also run `/code-review` or `find-bugs` over the same diff: a second reviewer with the
   same mandate re-reads the same code for the same cost and mostly restates the first.

2. **Security audit — on the classifier's verdict, scoped.** Run `pnpm classify` over the branch
   (`documentation-process.md` §3d):
   - **New authority** → both agents in `audit` mode, in parallel:
     **`security-auditor`** (ADR-017) and **`llm-security-auditor`** (ADR-022/023/024).
   - **Modified control, no new authority** → **one** auditor, the one that owns that control.
   - **Neither** → no audit; say so in one line.

   Every dispatch carries three things, and this is what keeps it cheap and sharp:
   - **The scope** — the classifier's file list. An auditor that has to find its own targets reads
     two hundred files shallowly instead of six deeply.
   - **The design-time controls** — the feature's `## Security` section or `security.md`, with the
     requirement to report each one *implemented / missing / changed*. A control specified at
     `/spec` and absent in the code is a blocking finding regardless of severity.
   - **The invariants already enforced** — the relevant `*.contract.test.ts` files, with an
     instruction not to re-derive them. Ask an auditor only about what cannot be tested.

   **Whatever it finds that *can* be tested becomes a contract test in the fixing task**
   (`docs/constitution.md` §Agent economics). That is what makes the next feature cheaper instead of
   the same price forever.

   Resolve Critical/High before the PR. For Medium/Low, either fix or record them explicitly as
   accepted risks in the feature's `security.md` (the `ai-tutor-guardrails` S13 register is the shape)
   — an unrecorded "we'll get to it" is how a known gap becomes an unknown one. If neither agent
   applies, say so in one line.

3. **Gate Docs (DoD)** — from `documentation-process.md` §7, a PR doesn't close without all three.
   Do this inline when the branch touched one or two documented surfaces; dispatch the
   **`docs-updater`** agent only when the docs footprint is wide enough that finding every stale
   reference is itself the work:
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