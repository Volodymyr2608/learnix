# ADR-021: Spec-Gated Command Workflow

- **Status**: Accepted
- **Date**: 2026-06-28

## Context

ADR-020 established a spec-first hybrid model (Intent → `spec.md`, Decisions → ADR, Correctness →
Harness) and `documentation-process.md` spells out the mechanics — including, unambiguously, "get the
plan approved **before** writing code." In practice the ordering was not holding: implementation
landed first and `spec.md` / `build/plan.md` were written **afterward** to satisfy the Gate-Docs DoD.
A spec written after the code is retroactive theater — it documents what was built rather than driving
what gets built, which is the inverse of its value and the source of drift ADR-020 set out to avoid.

The root cause was structural, not conceptual: the process *described* spec-first but nothing
*enforced* the ordering. It relied on discipline, and a long-running session under deadline pressure
skips ahead to code every time. A stale memory note describing the retired 4-document flow
(`requirements → spec → plan → validation`) compounded the confusion.

This mirrors the industry shift toward Spec-Driven Development tooling (GitHub Spec-Kit's
`/specify → /plan → /tasks → /implement`, Amazon Kiro, BMAD's planning→story→dev→QA pipeline), whose
common insight is that the spec must be a *gated input* the code is generated from, enforced
structurally rather than by good intentions.

## Decision

Add a **gated slash-command chain** on top of the ADR-020 hybrid — not a replacement, a structural
enforcement layer:

```
/spec <intent>   → infer tier; brainstorm; scaffold spec.md (status: planned); STOP for approval
/plan            → require approved spec; writing-plans → build/plan.md;        STOP for approval
/implement       → REFUSE without an approved build/plan.md; execute continuously (TDD, subagents)
/qa              → requesting-code-review + Gate Docs DoD (status→stable, spec:sync, ADR if 3-month); PR
```

The commands (`.claude/commands/{spec,plan,implement,qa}.md`) are thin orchestrators over the existing
superpowers skills (`brainstorming`, `writing-plans`, `subagent-driven-development`,
`requesting-code-review`) plus the existing tier and Gate-Docs mechanics. `/plan` additionally
dispatches the `feature-dev:code-explorer` and `code-architect` agents to ground the plan in real
file:line anchors; `/qa` dispatches `security-auditor` (complex tier) and `docs-updater` (Gate-Docs).

The load-bearing change is the **hard gate in `/implement`**: it refuses to run without an approved
`build/plan.md`, which itself requires an approved `spec.md`. Code can only flow out of `/implement`.

This is enforced **structurally, not just by convention**, via a `PreToolUse` hook
(`.claude/hooks/plan-gate.mjs`, wired in `.claude/settings.json`). The hook blocks every `Write`/`Edit`
to source zones (`app/`, `server/`, `lib/`, `prisma/`, …) unless a branch-scoped marker
(`.claude/.active-plan`) exists. The marker is created only by `/implement` (after the approved-plan
check) or by `/spec` on a trivial fix — so an agent physically cannot edit source before one of those
gates has run. `docs/`, `.claude/`, and root config stay writable (specs, plans, and ADRs are written
before the marker exists). Backfilling is therefore impossible, not merely discouraged.

A pointer-only `docs/constitution.md` (Spec-Kit-style) names the standing non-negotiables every plan
must honor, linking to CLAUDE.md conventions and ADR-011/016/017/018/020 rather than duplicating them.

Trivial/fix work is unaffected: `/spec` detects it via §3a, skips the chain, and routes straight to
`systematic-debugging` + TDD — the tier system already said this and that is preserved.

## Consequences

**Positive:**
- Spec-before-plan-before-code is enforced by a refusal, not by discipline. Backfilling is no longer
  the path of least resistance.
- Each phase is a single command, so spec-first is also the *easiest* path, not just the required one.
- Keeps everything ADR-020 already got right — tiers, the two-doc model, harness/TDD, `spec:sync`.

**Negative / accepted tradeoffs:**
- The hard gate is a local `PreToolUse` hook, not CI — it protects the agent's own edits in a Claude
  Code session, and is bypassable on purpose via `PLAN_GATE_OFF=1` (the conscious-override escape
  hatch for trivial work). It does not stop a human editing files directly in their editor; CI/branch
  protection remains the backstop for that.
- The marker is branch-scoped and lives in the main checkout. **Git worktrees** (separate working
  dirs) won't see it, so source edits there fall back to the escape hatch — a known limitation.
- Four commands + a hook to maintain. Mitigated by keeping the commands thin orchestrators and the
  hook fail-open on any internal error (a hook bug never bricks a session).

## Alternatives considered

- **Pure-discipline tightening** (fix the memory, sharpen the DoD checklist, no commands) — rejected:
  it leaves the same structural gap that caused the backfilling in the first place.
- **Full BMAD multi-agent pipeline** (Analyst/PM/Architect/SM/Dev/QA role agents + sharded story
  files) — rejected as overkill for a solo project; its two best ideas (per-task context isolation,
  an explicit QA gate) are already covered by `subagent-driven-development` and `/qa`.

## References

- ADR-020 (hybrid documentation model) — the parent decision this enforces.
- `docs/specs/documentation-process.md` — tiers (§3a), spec format (§4), Gate Docs (§7), and the
  command-chain section.
- `docs/constitution.md` — standing non-negotiables referenced by every gate.
- `.claude/commands/{spec,plan,implement,qa}.md` — the command implementations.
- `.claude/hooks/plan-gate.mjs` + `.claude/settings.json` — the `PreToolUse` hook enforcing the gate.