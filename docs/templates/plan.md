<!--
TEMPLATE · plan.md (Stage 3 of 4 — the EXECUTION, task by task)
Influences: superpowers:writing-plans (TDD, bite-sized tasks), BMAD-METHOD (dev-ready stories).

How to use:
  1. Fill this ONLY after spec.md is approved. Produce it with the `writing-plans` skill and SAVE
     IT HERE (in the spec folder) — not in docs/superpowers/plans/.
  2. Write for an engineer with zero context for this codebase: exact file paths, complete code in
     every code step (NO placeholders like "add error handling"), exact commands + expected output.
  3. Test-Driven: for each unit of behaviour — write the failing test, run it (see it fail),
     implement minimally, run it (see it pass), commit. Each step is one 2–5 min action.
  4. Every FR in requirements.md must map to a task (prove it in Self-review).
  5. Get explicit approval, THEN execute with subagent-driven-development / executing-plans.
Delete this comment block and every <!-- guidance --> note before finalising.
-->

# <Feature Name> Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax. See [`requirements.md`](./requirements.md) for FRs,
> [`spec.md`](./spec.md) for design, [`validation.md`](./validation.md) for checks.

**Goal:** <one sentence — what this builds>

**Architecture:** <2–3 sentences on the approach, echoing spec.md>

**Tech Stack:** <key technologies/libraries>

**Codebase anchors (verified during planning):**
<!-- The real signatures/patterns/paths the tasks reuse, each cited file:line. This is what keeps
     the code in the steps accurate. Read these before writing tasks. -->
- `<symbol>` (`<path>`) — <what it provides / how it's reused>.

**Per-task conventions:** <e.g. after the impl step, `pnpm typecheck` + `pnpm check` must be clean
before committing; unit tests colocated `*.test.ts`; integration `*.integration.test.ts`; services
and repositories export singletons.>

---

## Task 1: <Component / outcome>

**Files:**
- Create: `<exact/path>`
- Modify: `<exact/path>:<lines>`
- Test: `<exact/path>`

- [ ] **Step 1: Write the failing test**

```ts
// real, runnable test for the behaviour
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm vitest run <path>`
Expected: FAIL — <reason, e.g. "module not found">

- [ ] **Step 3: Implement minimally**

```ts
// the actual code that makes the test pass
```

- [ ] **Step 4: Run it, expect PASS** — and `pnpm typecheck` + `pnpm check` clean.

- [ ] **Step 5: Commit**

```bash
git commit -m "<type(scope): message>"
```

<!-- Repeat Task N for every unit. Order so the build stays green between tasks where possible;
     where a task intentionally leaves the build red (e.g. a breaking schema change fixed by the
     next task), say so explicitly. Non-code tasks (UI, docs) may group steps but still end in a
     commit and a verification command. -->

---

## Self-review (run before handoff)

- **Spec coverage:** map every FR (FR1…FRn) to a Task number. List any gap and add a task.
- **Placeholder scan:** no `TBD`/`TODO`/"handle edge cases"/"similar to Task N" left in code steps.
- **Type consistency:** method/type/property names match across tasks (a rename mid-plan is a bug).

## Final verification (see [`validation.md`](./validation.md) for detail)

- <`pnpm typecheck`, `pnpm check`, `pnpm test:unit`, `pnpm test:integration` — all green.>
- <key end-to-end manual checks the feature must pass.>