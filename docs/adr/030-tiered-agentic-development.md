# ADR-030: Decide process ceremony from the diff, and measure what it costs

- **Status**: Accepted
- **Date**: 2026-08-25

## Context

[ADR-020](020-hybrid-documentation-model.md) established three tiers and [ADR-021](021-spec-gated-command-workflow.md)
made them structural through the `/spec → /plan → /implement → /qa` chain and the `plan-gate` hook.
Both worked: specs stopped being backfilled, and the gate is a 114-line deterministic hook that costs
nothing to run. What neither did was bound the cost of the ceremony they introduced, and the
complaint that prompted this ADR was that developing one feature had become slow and expensive.

The first thing done was to measure, because the process had no answer to "what does one feature
cost" — the same blindness `ai-hardening-plan.md` *(removed 2026-08-26; in git history)* §3 records about
generated courses, turned on the development process itself. `pnpm agent-cost` reads this project's
Claude Code transcripts. Over 43 sessions and 145 subagent dispatches, in cache-weighted units
(a cache read at 0.1x, a cache write at 1.25x, so a warm session and a cold subagent are comparable):

| | weighted | share |
|---|---|---|
| main sessions | 257.2M | **71%** |
| subagents | 106.6M | 29% |
| — of which the whole `/spec → /qa` agent chain | 44M | **~12% of total** |
| — of which ad-hoc `general-purpose` + `claude` | 59M | 16% of total |

**The numbers contradicted the plan they were meant to inform**, in three ways worth recording
because each one had felt obvious beforehand.

1. **Subagents were not the problem.** They are 29%. The main session is 71%, and no part of the
   original plan addressed it.
2. **The topology was already warm.** Cache reads are 98% of all input. "Cold subagents versus a warm
   session" is real for short dispatches but is not the order-of-magnitude effect it was assumed to
   be — a subagent builds its own cache within a few turns.
3. **The threat pass was not where the money went.** Both auditors plus `code-explorer`,
   `code-architect` and `docs-updater` together are ~12% of the budget. The thing scheduled to be cut
   first was an eighth of the problem.

What the data did show was a lever nobody had proposed. Across 4,900 tool-calling turns, exactly
**one** turn batched more than a single tool call, while 61% of calls sat inside runs of two or more
consecutive read-only calls. Every call is a round-trip that re-sends the whole context. Collapsing
the genuinely independent ones bounds out at −50% of tool turns, which is several times the entire
threat pass.

Two structural problems were confirmed rather than overturned.

**The tiers were nominal.** Standard and complex differed only by "plus an ADR" — same spec, same
plan, same threat pass, same `/qa`. So nearly every change paid the maximal process regardless of
what it touched.

**Whether a change needed the threat pass was re-derived three times.** At `/spec`, at `/plan` and
at `/qa`, each time by a model with no memory of the other two rulings, each time defaulting to
"run everything". The trigger was phrased by *surface* — "any prompt, any procedure" — so editing one
line inside an already-guarded entry point bought the same two `opus` passes as building a new one.

## Decision

### 1. The tiers become three different pipelines

A tier is a shape of pipeline, not a set of documents.

| Tier | Pipeline | Subagents |
|---|---|---|
| trivial/fix | TDD against the harness; no spec, no plan | none |
| standard | `spec.md` + a thin `build/plan.md`, executed inline, reviewed as a diff against the contract tests | **none by default** |
| complex (*guarded*) | the above plus a threat pass, scoped auditors, and an ADR | 1–2, scoped |

### 2. The guarded trigger is mechanical

`pnpm classify` (`scripts/classify-change.ts`) reads the diff and reports `GUARDED` or
`STANDARD-OR-DIRECT`. `GUARDED` **is** the complex trigger — one decision procedure, and the tier
vocabulary is kept because it is baked into shipped specs.

It fires on two distinct classes, because they need different audits:

- **New authority** — the change hands the system a power it did not have: a new agent tool, graph
  node, AI entry point, tRPC procedure, route handler, Prisma model, migration, environment
  variable, or any touch of the money path. → full design pass at `/spec`.
- **Modified control** — the change alters a boundary that already exists: the shared AI guard, an
  output boundary, a tool authority check, procedure-level authorization. → **no design pass**; one
  auditor pointed at that control, with a false-positive check on legitimate input.

A change *inside* an already-guarded surface is neither, and inherits its controls by reference in
one line naming the `security.md` they come from.

The second class came out of back-testing, not design. An authority-only classifier called the
multilingual guard work (ADR-028) unguarded: it added no power at all, it rewrote the L1 pattern set
— which is exactly the change that most needs an auditor. Back-tested across seven merged branches,
every branch that produced an ADR classifies guarded; the repository refactor and the test-only fix
do not.

### 3. The plan carries contracts, not code

`docs/templates/plan.md` no longer asks for "complete code in every code step". A task states the
contract, the test that proves it, the files, and the acceptance criterion.

A thick plan pays for itself only when a *cheaper* model executes it. Here the executor is the model
that wrote the plan, so the feature was generated twice — once as code inside markdown, once as code
— and the two drifted. The exception, marked on the task as `code included: <reason>`, is when the
exact form of the code is the thing being approved: a non-trivial migration, the money or crypto
path, a guard regex.

### 4. Execution is inline; a subagent is bought for context isolation

`/implement` runs `executing-plans` in the current session. A subagent is dispatched only for work
that *reads a lot and returns little*, and reconnaissance goes to `Explore` rather than
`general-purpose` — 345k median against 545k, for the same job, across 48 dispatches. `/plan` drops
one of its two reconnaissance dispatches: `code-explorer` returns the anchors and the planning
session writes the blueprint, since `code-architect` has the highest median cost of any dispatch
here (1.2M) and is now reserved for genuinely new architecture.

### 5. Each `/qa` pass gets one mandate

The code review owns correctness, conventions and readability, and explicitly not security. The
auditors run only on the classifier's verdict and are handed three things: the scope (its file
list), the design-time controls to report as implemented/missing/changed, and **the invariants
already enforced by `*.contract.test.ts`, with instructions not to re-derive them**. An auditor is
asked only about what cannot be tested. Both auditors lose `Write` and `Edit`.

### 6. A repeated check becomes a contract test

When a review or audit finds a problem whose *class* is mechanically checkable, the fixing task also
adds a `*.contract.test.ts`, and the next feature is entitled not to ask about that class. This is
the only mechanism here that makes the cost of quality fall over time rather than stay flat. Two
component conventions moved out of CLAUDE.md prose into `componentConventions.contract.test.ts` as
the first instance.

**A lint rule would have been better, and is not available.** The intent was to express "components
are arrow consts" as a Biome rule, since a rule beats a test for a purely syntactic constraint.
Biome 2.4.6 cannot: `useArrowFunction` explicitly excludes top-level function declarations
([biomejs/biome#7108](https://github.com/biomejs/biome/discussions/7108)), and Biome has no
`noRestrictedSyntax` escape hatch to write one by hand. The contract test is the fallback, and if
that rule gains top-level support the check should move there and the test should go.

## Consequences

- **The classifier can be wrong, and that is visible.** It prints the signal and the files, so a
  disputed verdict is a line to argue with. A missed signal is a gap in a table anyone can extend;
  the previous mechanism — a model's judgement, made three times — left nothing to inspect.
- **Guarded stays common.** Five of the seven back-tested branches classify guarded. The change is
  not that the threat pass runs less often; it is that it runs *deterministically*, *scoped*, and
  without a design pass when only a control moved.
- **Standard work now has no agent review by default.** The diff and the contract tests are the
  review of record. This is a real reduction in coverage, taken deliberately: 18 contract tests
  already enforce the invariants the auditors were re-deriving, and the classifier escalates anything
  that touches authority or a control.
- **The arrow-function convention ships as a ratchet, not a rule.** 66 of 221 components still use
  `export function`. The count is pinned so the debt cannot grow; converting them is a separate
  refactor with its own regression risk.
- **The baseline is a fixed point.** `pnpm agent-cost` re-run after the next feature is a direct
  before/after, not an opinion.

## Alternatives considered

**Declare the routing in `build/plan.md` per feature.** The first design: a table of planned
dispatches with a token budget, approved along with the plan. Dropped once the classifier existed —
if the verdict is derivable from the diff, a per-feature table restates it by hand and can disagree
with it. The budget idea survives as the classifier printing its scope.

**Cut the auditors first.** The original plan's priority. The measurement moved it down: they are
~11% of subagent spend between them, and they are the passes with the least redundant coverage now
that they are scoped.

**Keep thick plans and route execution to a cheap model.** Coherent, and the alternative branch of
the same fork: thick plans plus haiku/sonnet executors would pay for the duplicated generation. Not
chosen because it keeps the plan↔code drift, and because the measured cache economics favour one
warm session over many cold ones.

**Rename the tiers to direct/standard/guarded.** The names would then match the classifier exactly.
Rejected: `trivial`/`standard`/`complex` appear in roughly twenty files including shipped feature
specs, and rewriting the historical record to fix a vocabulary mismatch is churn. The mapping is
stated once instead.

## References

- [ADR-020](020-hybrid-documentation-model.md) — the tiers this narrows
- [ADR-021](021-spec-gated-command-workflow.md) — the chain this reshapes; its `plan-gate` hook is unchanged
- [ADR-028](028-multilingual-ai-guard-coverage.md) — the branch that produced the `control` signal class
- [`docs/constitution.md`](../constitution.md) §Agent economics — the standing rules
- [`docs/specs/documentation-process.md`](../specs/documentation-process.md) §3, §3a, §3c, §3d — the mechanics
- `scripts/agent-cost.ts`, `scripts/classify-change.ts`