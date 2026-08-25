<!--
TEMPLATE · build/plan.md (the EXECUTION, task by task — the second of two docs, after spec.md)
Influences: superpowers:writing-plans (TDD, bite-sized tasks), BMAD-METHOD (dev-ready stories).

How to use:
  1. Fill this ONLY after spec.md is approved.
  2. Write CONTRACTS, not implementations. Each task names the behaviour, the test that proves it,
     the files it touches, and the acceptance criterion it satisfies. The code goes in the commit.
     See "Why the plan is thin" below before you reach for a code block.
  3. Test-Driven: for each unit of behaviour — write the failing test, run it (see it fail),
     implement minimally, run it (see it pass), commit.
  4. Every Acceptance criterion in spec.md must map to a task (prove it in Self-review).
  5. Get explicit approval, THEN execute.
Delete this comment block and every <!-- guidance --> note before finalising.
-->

# <Feature Name> Implementation Plan

> **For agentic workers:** execute with `superpowers:executing-plans` in this session — the warm
> context is the cheapest place to run TDD loops (ADR-030). Dispatch a subagent only for work that
> *reads a lot and returns little*; reconnaissance goes to `Explore`, never `general-purpose`.
> Steps use checkbox (`- [ ]`) syntax. See [`../spec.md`](../spec.md) for the design and Acceptance
> criteria.

**Goal:** <one sentence — what this builds>

**Architecture:** <2–3 sentences on the approach, echoing spec.md>

**Track:** <`standard` | `guarded` — paste the `pnpm classify` verdict and its reason. If guarded,
every listed authority or control gets its own task with its own test below.>

**Codebase anchors (verified during planning):**
<!-- The real signatures/patterns/paths the tasks reuse, each cited file:line. This is what keeps
     the tasks accurate. Read these before writing them. -->
- `<symbol>` (`<path>:<line>`) — <what it provides / how it's reused>.

**Per-task conventions:** <e.g. after the impl step, `pnpm typecheck` + `pnpm check` must be clean
before committing; unit tests colocated `*.test.ts`; integration `*.integration.test.ts`; services
and repositories export singletons.>

---

## Task 1 — <the behaviour, stated as an outcome>

- **Contract:** <what is true after this task that was not true before, in one or two sentences.
  Name the function or module and the observable behaviour — not the implementation.>
- **Test:** `<exact/path/to.test.ts>` — <the cases: the positive one, and the one that would fail
  before this task. For a probabilistic control, a false-positive case on legitimate input too.>
- **Files:** `<exact/path.ts>`, `<exact/other.ts>`
- **AC:** spec.md #<n>
- **Commit:** `<type(scope): message>`

- [ ] Write the failing test · [ ] Run it, see it FAIL (<why it fails now>) · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

<!-- Repeat for every unit. Order so the build stays green between tasks where possible; where a
     task intentionally leaves it red (a breaking schema change fixed by the next task), say so. -->

---

## Why the plan is thin

<!-- Keep this section; it is the standing rationale, not per-feature prose. -->

A plan carrying full implementation code only pays for itself when a *cheaper* model executes it.
Here the executor is the same model that wrote the plan, so the feature gets generated twice — once
as code inside markdown, once as code — and the two drift. Contracts and test names are enough to
execute from, and the compiler and the tests catch what prose cannot. — ADR-030.

**The exception, and it is narrow:** include code when the exact form of the code *is* the thing
being approved — a non-trivial migration, a change on the money or crypto path, a guard regex where
a mistake is expensive. When you do, say so on the task line: `code included: <reason>`.

## Self-review (run before handoff)

- **Spec coverage:** map every Acceptance criterion in `spec.md` to a task. List any gap and add a task.
- **Guarded coverage:** every authority and control named by `pnpm classify` has a task with a test.
- **Contract clarity:** each task states an observable behaviour, not "update X" or "handle errors".
- **Type consistency:** method/type/property names match across tasks (a rename mid-plan is a bug).

## Final verification

- <`pnpm typecheck`, `pnpm check`, `pnpm test:unit`, `pnpm test:integration` — all green.>
- <key end-to-end manual checks the feature must pass.>
- <For a new contract test: break the thing it guards on purpose and see it go red. A test that
  never fails proves nothing.>