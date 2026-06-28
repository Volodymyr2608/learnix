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

## Tooling

- **Biome**, not ESLint/Prettier (`biome.jsonc`); auto-sorted imports and Tailwind classes.
- **Env vars** are declared and validated in `lib/env.js` — that file is the source of truth.