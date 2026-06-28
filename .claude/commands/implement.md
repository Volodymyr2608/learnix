---
argument-hint: [feature slug — optional if obvious from the approved plan]
description: Phase 3 of the spec-gated workflow — execute an approved build/plan.md continuously with TDD
---

You are running **`/implement`**, the third gate of the spec-gated workflow (ADR-021). This is the
**anti-backfill enforcement point**: code only ever flows out of `/implement`, and `/implement` is
blocked without an approved plan, which is blocked without an approved spec.

Target feature: <feature>$ARGUMENTS</feature> (if empty, use the feature whose plan was just approved).

## Precondition (hard — do not bypass)

There must be an **approved** `docs/specs/features/<slug>/build/plan.md`. If it does not exist, refuse:

> No approved `build/plan.md` for this feature. Run `/plan` first and get it approved. Code is never
> written before an approved plan — that's the whole point of this workflow.

The one exception is trivial/fix work, which never reaches `/implement` (it's handled inside `/spec`
via `systematic-debugging` + TDD). If the user insists on coding without a plan, tell them to override
explicitly ("quick fix, skip the spec") so it's a conscious choice, not a silent backfill.

## Steps

0. **Open the plan gate.** Only after the approved-plan precondition above is satisfied, write the
   gate marker so the `plan-gate` hook (ADR-021) allows source edits on this branch:
   ```
   printf 'branch=%s\nfeature=<slug>\nplan=docs/specs/features/<slug>/build/plan.md\napproved=%s\n' \
     "$(git rev-parse --abbrev-ref HEAD)" "$(date -u +%FT%TZ)" > .claude/.active-plan
   ```
   Without this marker, every `Edit`/`Write` to `app/`, `server/`, `lib/`, `prisma/`, etc. is blocked —
   that is the structural enforcement of "no code before an approved plan." Do **not** create the
   marker to bypass the precondition; create it only because the precondition is genuinely met.
1. Flip the spec frontmatter `status: planned → in-progress`.
2. Execute the plan with `superpowers:subagent-driven-development` (or `executing-plans`)
   **continuously** — run every task end to end via its TDD loop (failing test → run → implement →
   pass → commit). Do **not** pause between tasks to ask "should I continue?" or to make the user check
   status. Stop only for a genuine blocker you cannot resolve yourself, or when all tasks are done.
3. Honor `docs/constitution.md` throughout (component-folder architecture, arrow-function components,
   no nested ternaries, types in `types.ts`, OWASP rules).

When all tasks are green, hand off to **`/qa`** for review + the Gate Docs DoD.