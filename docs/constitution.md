# Learnix Constitution

The standing, non-negotiable constraints every spec, plan, and implementation must honor. This file is
**pointer-only** — it does not duplicate the canonical sources, it names them. Every gate of the
spec-gated workflow (`/spec → /plan → /implement → /qa`, see ADR-021) reads this as the set of rules a
plan is not allowed to violate.

## Process

- **Spec-first, gated.** Standard/complex work flows `/spec → /plan → /implement → /qa`. Code is never
  written before an approved `build/plan.md`, which is never written before an approved `spec.md`. No
  backfilling specs or plans after the code. Enforced by the `plan-gate` `PreToolUse` hook
  (`.claude/hooks/plan-gate.mjs`), which blocks source edits without an approved-plan marker. —
  ADR-020, ADR-021, `docs/specs/documentation-process.md`.
- **Tiers decide ceremony, not rigor.** Infer the tier from what the change touches
  (`documentation-process.md` §3a). Trivial/fix work skips the chain but still ships with tests.
- **Gate Docs is the DoD.** No PR closes without spec frontmatter updated, `pnpm spec:sync` committed,
  and an ADR when the 3-month test is met. — `documentation-process.md` §7.

## Architecture

- **Three-layer server.** routers → services → repositories; repositories extend `BaseRepository`;
  services have companion `.errors.ts`. — `CLAUDE.md` (Server-side layer), ADR-003.
- **Role enforcement at the procedure level** (`publicProcedure`…`adminProcedure`). — ADR-004.
- **Component-folder architecture.** Colocated `types.ts` always; one component per folder; helpers in
  `utils.ts`; arrow functions everywhere; no nested ternaries; flatten loading states; sub-components
  own their mutations. — `CLAUDE.md` (Component conventions), ADR-011.

## Correctness & security

- **Testing pyramid.** Unit (`*.test.ts`, no DB) / integration (`*.integration.test.ts`, real
  `learnix_test`) / evals (offline, manual before prompt changes). — `CLAUDE.md` (Testing), ADR-018.
- **OWASP rules** — ownership/IDOR checks, input validation, the security model. — ADR-017.
- **AI features** — LangGraph course-builder shape and conventions are decided. — ADR-016.
- **Threats are modelled at `/spec`, not discovered at `/qa`.** Any feature touching authz, money,
  personal data, or an external service runs the **`security-auditor`** agent in `design` mode; any
  feature touching a prompt, model call, tool, embedding path, or model-authored rendering runs the
  **`llm-security-auditor`** in `design` mode. Their controls land in Acceptance criteria, become
  tasks with tests at `/plan`, and are checked back one by one at `/qa`. A control specified at
  `/spec` and missing in the code blocks the PR.
- **A model is never a security boundary.** Enforcement is the closed tool set + authority checks,
  validation before persistence, and the client `urlTransform` at render. Prompt instructions are
  defence in depth and must be described as such. — ADR-022, ADR-023, ADR-024.
- **Accepted risk is written down.** A known gap that is not fixed goes in the feature's `security.md`
  register with its residual impact (`features/ai-tutor-guardrails/security.md` §S13 is the shape).

## Agent economics

Measured, not assumed — `pnpm agent-cost` (`scripts/agent-cost.ts`) reports the numbers behind each
rule below. Baseline taken 2026-08-25 over 43 sessions and 145 dispatches. — ADR-030.

- **Batch independent tool calls into one turn.** Every tool call is a round-trip that re-sends the
  whole context, and the main session is **71%** of all spend. In the baseline, 61% of tool calls sat
  inside runs of two or more consecutive read-only calls, while exactly **1 turn out of 4,900**
  batched anything. Collapsing genuinely independent calls is the single largest lever in this file.
- **Reconnaissance is `Explore`, not `general-purpose`.** Same job, half the cost: median 345k
  weighted units against 545k, across 48 `general-purpose` dispatches. Reach for `general-purpose`
  only when the task also has to write.
- **A subagent is bought for context isolation, not intelligence.** Dispatch one only when it *reads
  a lot and returns little*. Executing a task whose context the caller already holds pays for that
  context twice and loses detail at the summarisation boundary.
- **A repeated check becomes a contract test.** When a review or audit finds a problem whose *class*
  is mechanically checkable, the fixing task also adds a `*.contract.test.ts`. The next feature is
  then entitled not to ask about that class again — this is the only mechanism here that makes the
  cost of quality fall over time rather than rise.

## Tooling

- **Biome**, not ESLint/Prettier (`biome.jsonc`); auto-sorted imports and Tailwind classes.
- **Env vars** are declared and validated in `lib/env.js` — that file is the source of truth.