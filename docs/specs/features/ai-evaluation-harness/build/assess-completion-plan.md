# Make `courseAI:assessCompletion` measure its node — Implementation Plan

> **For agentic workers:** execute with `superpowers:executing-plans` in this session — the warm
> context is the cheapest place to run TDD loops (ADR-030). Dispatch a subagent only for work that
> *reads a lot and returns little*; reconnaissance goes to `Explore`, never `general-purpose`.
> Steps use checkbox (`- [ ]`) syntax. See [`../spec.md`](../spec.md) for the design and Acceptance
> criteria 16–20.

> **Sibling plan, not a rewrite.** [`plan.md`](plan.md) (the harness itself) and
> [`doc-figures-plan.md`](doc-figures-plan.md) are frozen build history and must not be edited —
> `documentation-process.md` §1a. This is the third wave on the same feature, in the shape
> `ai-tutor-guardrails/build/` already uses.

**Goal:** make `pnpm eval courseAI:assessCompletion` actually exercise the `assess_completion` node —
with the field the node reads, against the question the node answers, over all three decisions it can
return — and pin every part of that with a contract test so the set cannot silently stop measuring
again.

**Architecture:** no new module and no change under `server/`. The node is correct; the eval and its
dataset are wrong in three separate ways, each closed by an existing harness primitive rather than a
new one. The dataset gains the turn the node reads and re-expresses its expectation as one of the
node's own three decisions; the eval derives the observed decision from `{assessReady, assessClarify}`
and scores it with the `categoryGate` + `alwaysFailingGate` + `callCoverage` composition that
`classifyIntent.eval.ts` already uses; a new dataset contract test copies the shape of
`confidenceScoreDataset.contract.test.ts`. Three files touched, all under `evals/`.

**Track:** `standard`.

```
$ pnpm classify
No changes against b7b8ae990174.
```

The tree was clean at planning time, so the classifier had nothing to read — an honest verdict, not a
useful one. Assessed against `documentation-process.md` §3a by the files the work touches
(`evals/datasets/courseAI/assessCompletion.jsonl`, `evals/courseAI/assessCompletion.eval.ts`, two new
test files): **no new authority** — no agent tool, graph node, AI entry point, tRPC procedure, route
handler, Prisma model, migration, environment variable, nor any touch of the money path; **no modified
control** — nothing under `_shared/aiGuard/`, `_shared/aiOutput/`, `toolPolicy`, `server/api/trpc.ts`
or `server/better-auth/`. §3a question 2 is *yes* (this adds acceptance criteria 16–20 to
`ai-evaluation-harness`), so: **standard**. **No threat pass**; controls inherited by reference from
[`ai-tutor-guardrails/security.md`](../../ai-tutor-guardrails/security.md) — the harness is offline,
reads in-repo datasets, and adds no request path. The one input-trust rule that does apply is the
authoring rule, and it is carried as acceptance criterion 20 with its own task (Task 1).

**Codebase anchors (verified during planning):**

- `precisionGate(label, results: Array<{id, predicted, expected}>, threshold): boolean`
  (`evals/_shared/score.ts:335`) — **already fails an empty positive set** (`:344-350`), so the "prints
  100% over zero calls" half of P2 is closed; what remains is that the run measures nothing at all.
- `categoryGate(label, results: CategoryEvalResult[], thresholds: Record<string, number>): boolean`
  (`evals/_shared/score.ts:63`) — per-category thresholds; the mechanism that keeps guard rows from
  inflating a model accuracy.
- `alwaysFailingGate(label, stability, thresholds): boolean` (`evals/_shared/score.ts:136`) and
  `rowStability` (`:19`) / `flakyRows` (`:45`) / `formatRowOutcomes` (`:228`).
- `EvalResult = {id, ok}` (`evals/_shared/score.ts:1`), `CategoryEvalResult = EvalResult & {category}`
  (`:3`), `SampleOutcome = {id, ok, expected, actual}` (`:200`).
- `callCoverage(calls, claimedSamples): {ok, message}` (`evals/_shared/usage.ts:218`) — the check that
  a score covered as many model calls as it claims. **`assessCompletion.eval.ts` never calls it
  today**, which is why the absence was silent; `classifyIntent.eval.ts:131` is the shape to copy.
- `usageRecorder()` → `{handler, config, takeCalls, countCalls, openCalls}` (`evals/_shared/usage.ts:140`);
  `recorder.config` is `{callbacks:[handler]}` (`:146`) and is already passed to the node.
  `reportRunUsage(recorder, startedAt, concurrency?)` (`:285`) returns **void** — it prints and cannot
  fail a run, so coverage must be ANDed into the eval's own return.
- The node's guard: `if (!state.userMessage || state.intent === "revise" || state.intent === "clarify")
  return { assessReady: false, assessClarify: null }`
  (`server/services/courseAI/graph/nodes/assessCompletion.ts:28-33`) — the exact line the current eval
  never gets past.
- The node's decision schema: `z.object({ decision: z.enum(["ready","not_ready","ask"]), question: z.string().optional() })`
  (`.../assessCompletion.ts:11-15`); it writes `{assessReady, assessClarify}` only
  (`:33`, `:86-93`, `:95`), so the three decisions are observable as
  `assessReady === true` → `ready`; `assessClarify !== null` → `ask`; otherwise `not_ready`.
- `CourseBuilderStateT` (`server/services/courseAI/graph/state.ts:77-102`) — 19 fields; the eval
  constructs all of them per row and only `currentStep`, `history`, `assistantText` come from the
  dataset today (`evals/courseAI/assessCompletion.eval.ts:36-57`).
- `confidenceScoreDataset.contract.test.ts` — self-contained JSONL load (`:32-38`), per-message
  flattening (`:40-42`), `VERDICT_WORDS` (`:49-50`) and `COUNTS_THE_DRAFT` (`:61-62`) authoring checks.
  This is the template for the new test.
- `datasets.contract.test.ts` — floors only (parses, ≥5 rows, unique ids; `:46-65`); it does not read
  row fields, so a new field breaks nothing. Its baseline cross-check (`:97-128`) applies only to
  datasets that have a baseline file, and `courseAI:assessCompletion` has none.
- `EVALS` registry entry `"courseAI:assessCompletion": runAssessCompletionEval`
  (`evals/runEvals.ts:28`); a `false` return becomes `process.exit(1)` (`:83`). Registration does not
  change.

**Per-task conventions:** after the implement step, `pnpm typecheck` and `pnpm check` must be clean
before committing; unit tests colocated as `*.test.ts`, contract tests as `*.contract.test.ts`;
`pnpm test:unit` green at every commit. Dataset rows stay one JSON object per line, ids unique and
zero-padded as they are today.

**Explicit non-goals** — named so they are decisions, not omissions:

- **No sampling.** `sampledEvals()` (`evals/_shared/docFigures.ts:106`) detects a `SAMPLES = <n>`
  constant by regex (`:88-99`), and `singleSampleEvals` (`:153`) is pinned into
  `ai-eval-strategy.md` §3 and §9 (`docFigures.ts:525,532`), and `docFigures.contract.test.ts:590-597`
  asserts the sampled-eval **list** literally. Adding sampling here would move a figure in a second document — a separate change, and one this feature's own spec already
  tracks as debt (`spec.md`, Unsupported use cases).
- **No baseline for this eval.** It never calls `reportRun`, so `--baseline` is a no-op for it today
  (`evals/runEvals.ts:42-62`). Recording one also pulls in the `datasets.contract.test.ts:116-126`
  cross-check between baseline totals and dataset rows. Out of scope; the gates carry this eval.
- **No change under `server/`.** The node's early return is correct behaviour; it was the eval that
  drove it with the one input that trips it.

---

## Task 1 — The dataset's shape and authoring are pinned before the dataset changes

- **Contract:** a contract test states what a row of `assessCompletion.jsonl` must be: a non-empty
  latest user turn in its own field; an expectation naming one of `ready` / `not_ready` / `ask`; a
  `category` of `classified` or `early-return`; at least one row per guard clause (`intent: "revise"`,
  `intent: "clarify"`, empty `userMessage`), each of them `early-return`; and no grading vocabulary or
  draft-counting in any field the author writes as a *user* turn. It fails against the dataset as it
  stands today.
- **Test:** `evals/courseAI/assessCompletionDataset.contract.test.ts` — every row carries a non-empty
  `userMessage`; `expected.decision` is one of the three names (and `expected.ready` no longer exists);
  each of the three guard clauses has ≥1 row and those rows are `category: "early-return"` expecting
  `not_ready`; the `classified` class holds ≥8 rows expecting `ready` so the precision denominator is
  not one row wide; `userMessage` and every `history[].content` match neither `VERDICT_WORDS` nor
  `COUNTS_THE_DRAFT`.
- **Files:** `evals/courseAI/assessCompletionDataset.contract.test.ts` (new)
- **AC:** spec.md #16, #17, #19, #20
- **Note:** `assistantText` is **exempt** from the authoring regexes, and the test says so in a
  comment: in production it is the model's own previous turn, which legitimately summarises and counts
  ("4 sections with 11 lessons"). Forbidding that would forbid the realistic context the node reads.
  The authoring rule binds the fields whose author is the dataset's author speaking *as the user*.
- **Commit:** `test(evals): pin what an assessCompletion row must be before rewriting the set`

- [ ] Write the failing test · [ ] Run it, see it FAIL (rows have no `userMessage`, carry
  `expected.ready`, no `category`, no guard rows) · [ ] Implement — nothing to implement; this task
  ships the test alone and the next task turns it green
- [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 2 — The dataset asks the node's question with the node's input

- **Contract:** all rows of `evals/datasets/courseAI/assessCompletion.jsonl` are re-expressed so the
  set grades *does the latest user turn signal proceed* — the node's actual contract — rather than
  *is the step's content complete*, which is `confidenceScore`'s. 23 rows: 20 `classified` (8 `ready`,
  8 `not_ready`, 4 `ask`) and 3 `early-return` (one per guard clause). Task 1's test goes green.
- **Test:** `evals/courseAI/assessCompletionDataset.contract.test.ts` (from Task 1) plus the standing
  `evals/datasets/datasets.contract.test.ts` floors.
- **Files:** `evals/datasets/courseAI/assessCompletion.jsonl`
- **AC:** spec.md #16, #17, #19
- **Note:** the `ask` rows are the ones the old set could not express at all — a short ambiguous
  acknowledgement ("ok", "sure") after the assistant proposed a draft, which the node is supposed to
  answer with a question rather than an advance. The `ready` rows are explicit approvals, not rich
  content; the `not_ready` rows include the old set's "user supplies detail while a draft is on the
  table" case, which the production prompt names `not_ready` in as many words and the old set graded
  `ready`.
- **Commit:** `fix(evals): assessCompletion rows ask the node's question, not confidenceScore's`

- [ ] Run Task 1's test, see it FAIL · [ ] Rewrite the rows · [ ] Run it, see it PASS
- [ ] `pnpm test:unit` green · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 3 — The three decisions are observable from what the node writes

- **Contract:** a pure helper maps the node's output to the decision it made —
  `assessReady === true` → `ready`; `assessClarify` non-null → `ask`; otherwise `not_ready` — so the
  clarify path stops being indistinguishable from a refusal to advance. Unit-tested offline, with no
  network and no key.
- **Test:** `evals/courseAI/assessCompletion.test.ts` — the three mappings; the impossible-in-practice
  pair (`assessReady: true` with a clarify question) resolves to `ready` and is documented as
  deliberate; a `null` clarify with `assessReady: false` is `not_ready`, which is the case the old
  boolean conflated with `ask`.
- **Files:** `evals/courseAI/assessCompletion.eval.ts` (export the helper),
  `evals/courseAI/assessCompletion.test.ts` (new)
- **AC:** spec.md #18
- **Commit:** `feat(evals): derive assessCompletion's three decisions from node output`

- [ ] Write the failing test · [ ] Run it, see it FAIL (helper does not exist) · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 4 — The eval drives the node and cannot pass without having measured it

- **Contract:** `runAssessCompletionEval` builds each row's state from the row — `userMessage` from the
  new field, `intent` from the row (default `continue`) — scores the three decisions per category, and
  returns `true` only when all three of these hold: `categoryGate` at `{classified: 0.85,
  "early-return": 1}`, `precisionGate` at 0.9 over the `ready` class, and `callCoverage(modelCalls,
  classifiedRows)` — the last being the check that the run reached the provider once per row it claims
  to have scored. Flaky and failing rows are printed by id before the verdict.
- **Test:** no unit test drives this function (it calls the provider); it is proven by the live run in
  `## Final verification`, and its two failure modes are proven by falsification there — an eval that
  measures nothing must go **red**, which is the whole point of the task.
- **Files:** `evals/courseAI/assessCompletion.eval.ts`
- **AC:** spec.md #16, #18, #19
- **Note:** `reportRunUsage` returns `void` and only prints (`usage.ts:285`), so coverage has to be
  ANDed into the return value explicitly — a shortfall that only prints is exactly how this defect
  survived. Guard rows are excluded from the coverage denominator, as `classifyIntent.eval.ts:120-126`
  does, because they are supposed never to reach the model.
- **Commit:** `fix(evals): assessCompletion drives the node it claims to score`

- [ ] Write the eval against the contract · [ ] `pnpm typecheck` + `pnpm check` clean
- [ ] Live run (see Final verification) · [ ] Commit

---

## Deviations, recorded rather than tidied away

Two, both found while executing and both resolved against the plan's own text:

1. **`alwaysFailingGate` dropped.** The Architecture paragraph names it; Task 4's contract does not.
   At one draw per row it degenerates into "every classified row must pass", which contradicts the
   0.85 gate two lines above it. The task's contract was right and the architecture sentence was
   wrong; `precisionGate` took the slot.
2. **The set was re-staged after review.** Tasks 1–2 shipped a set whose assistant reply predicted
   the label perfectly — the leak class this feature exists to prevent, in the one field the contract
   test exempts. The repair is in the spec's criterion 20 and cost a second and third live run. The
   plan did not anticipate it, and could not have: it is the failure mode that only appears once the
   eval measures something.

## Why the plan is thin

A plan carrying full implementation code only pays for itself when a *cheaper* model executes it.
Here the executor is the same model that wrote the plan, so the feature gets generated twice — once as
code inside markdown, once as code — and the two drift. Contracts and test names are enough to execute
from, and the compiler and the tests catch what prose cannot. — ADR-030.

The one place this plan comes close to prescribing form is Task 2's row budget (8 / 8 / 4 / 3). That
is not implementation detail: the `ready` count is the denominator `precisionGate`'s 0.9 threshold acts
on, and a set with three `ready` rows makes the gate meaningless. It is stated as a contract for that
reason.

## Self-review (run before handoff)

| Acceptance criterion | Task |
|---|---|
| #16 — eval drives the node through the field the node reads | Task 1 (test), Task 2 (rows), Task 4 (eval passes it, coverage ANDed in) |
| #17 — the dataset asks the question its node answers | Task 1 (test), Task 2 (rows) |
| #18 — all three decisions measured, not two | Task 3 (helper + unit test), Task 4 (per-category scoring) |
| #19 — the guard that hid the defect is itself measured | Task 1 (test demands a row per clause), Task 2 (rows), Task 4 (`early-return` gated at 1.0) |
| #20 — a new prompt-facing field inherits the authoring rule | Task 1 |

- **Guarded coverage:** classifier verdict is not guarded; no authority or control named, so no
  security task is owed. The single input-trust rule that applies (authoring) has its own task.
- **Contract clarity:** each task names an observable outcome; Task 1 is deliberately a test-only
  commit, and says so rather than pretending to implement something.
- **Type consistency:** `category` values `classified` / `early-return` match `classifyIntent`'s
  vocabulary; `expected.decision` values match the node's own `z.enum` exactly.

## Final verification

- `pnpm typecheck`, `pnpm check`, `pnpm test:unit` — all green.
- `pnpm eval courseAI:assessCompletion` — the run **calls the model** (the printed call count is
  non-zero and equals the `classified` row count), prints a precision on `ready` over a real
  denominator, and prints per-category accuracy across the three decisions.
- **Falsification, the point of the whole change** — break it on purpose and watch it go red:
  1. Set one row's `userMessage` back to `""` → Task 1's contract test fails by name.
  2. Temporarily hardcode `userMessage: ""` in the eval → the run fails on `callCoverage` and on
     `precisionGate`'s empty-positive branch, and says the run measured nothing. Before this change
     the same edit printed `100.0%`.
  3. Delete the `intent: "clarify"` row → Task 1's contract test names the missing guard clause.
- Restore all three, re-run, confirm green.
