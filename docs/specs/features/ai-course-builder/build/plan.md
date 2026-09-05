# Intent routing, second pass (P3) — Implementation Plan

> **For agentic workers:** execute with `superpowers:executing-plans` in this session — the warm
> context is the cheapest place to run TDD loops (ADR-030). Dispatch a subagent only for work that
> *reads a lot and returns little*; reconnaissance goes to `Explore`, never `general-purpose`.
> Steps use checkbox (`- [ ]`) syntax. See [`../spec.md`](../spec.md) §"Intent routing" for the
> design and Acceptance criteria.

**Goal:** make `courseAI:classifyIntent` capable of measuring the node before anything changes the
node, then close the one routing class it still fails.

**Architecture:** two halves, strictly in that order. The eval stops reporting one draw as an
answer — three samples a row, the rows that never reach the model scored as their own category, a
second floor that a rate cannot express, and a run that proves it made the calls it claims. Only
then does the prompt move, under a contract test that stops the fix being written around the set's
wording. Nothing in production changes except one prompt string; the graph, the schema, the revise
path and persistence are untouched.

**Why the measurement comes first, stated once:** three runs of *unchanged* code on `main` returned
**90.0%, 85.0% and 80.0%** against an 0.85 gate. Any prompt edit measured against that instrument is
indistinguishable from drift, in both directions — a bad change can read green and a good one red.
This is the same sequencing the `confidence_score` reopening used, for the same reason.

**Track:** `standard`. `pnpm classify` reports `STANDARD-OR-DIRECT` — *"No new authority and no
control touched — the guarded track does not apply. Controls for surfaces already covered are
inherited by reference."* Editing a prompt inside an already-registered entry point is neither new
authority nor a modified control (`documentation-process.md` §3a), so no design pass ran and
§Security's controls are inherited by reference. **There is no security task below because there is
no security delta:** the node's inputs, its wrapping, its output schema and its `fallback_triggered`
emitter are all untouched, and the eval half reaches no production code path at all.

**Codebase anchors (verified during planning):**

- `runClassifyIntentEval` (`evals/courseAI/classifyIntent.eval.ts:34`) — one `EvalResult` per row
  through `Promise.all`, gated by `accuracyGate("classifyIntent", results, 0.85)` at `:76`. Dataset
  loader at `:28`, path at `:23`.
- `classifyIntent` (`server/services/courseAI/graph/nodes/classifyIntent.ts:60`) — the node. The
  short-circuit the categories mirror is `state.history.length === 0 || !state.userMessage` at
  `:64`; `outSchema` at `:46`; the prompt template starts at `:103`. Only `:103`'s string moves.
- `categoryGate` (`evals/_shared/score.ts:63`) — per-category table; gates **only** categories
  present in `thresholds`, so an ungated category is reported and can never redden a run.
- `CategoryEvalResult` (`evals/_shared/score.ts:3`) — `EvalResult & { category: string }`, the shape
  `categoryGate` consumes.
- `rowStability` / `flakyRows` (`evals/_shared/score.ts:19`, `:45`) — collapse repeated samples of a
  row into `passed/samples`; `flakyRows` returns the rows that are neither always nor never.
- `formatScoreTable` (`evals/_shared/score.ts:121`) — the precedent for "print what is behind the
  number", written for `confidenceScore`. Task 1 is its sibling for a classifier.
- `accuracyGate` (`evals/_shared/score.ts:185`) — what this eval uses today and stops using at
  Task 3.
- Sampling shape to copy (`evals/lessonAI/tutor.eval.ts:79`, `:326`, `:433`–`:455`) — `SAMPLES = 3`,
  `rows.flatMap(row => Array.from({ length: SAMPLES }, () => row))`, then the always-failing block
  and the flaky block.
- `sampledEvals` (`evals/_shared/docFigures.ts:78`) — detects a `SAMPLES = <n>` constant with
  comments stripped, **not** a hand-kept list; `singleSampleEvals` derives from it at `:125`.
- The pinned prose (`evals/_shared/docFigures.ts:296`, `:302`) — claims over
  `docs/specs/ai-eval-strategy.md:108` (*"nine of the other twelve are single-sample, pooled"*) and
  `:366` (*"**Nine of thirteen** evals are single-sample and pooled."*). Both must read *eight* /
  *Eight* once Task 2 lands.
- `usageRecorder` (`evals/_shared/usage.ts:135`) — `takeCalls()` returns one `EvalCall` per finished
  model call; `openCalls()` the started-and-never-ended count.
- `reportRunUsage` (`evals/_shared/usage.ts:227`) — **drains** `takeCalls()` at `:237`. Task 5's
  count must therefore be taken *before* this call, not after.
- `confidenceScorePrompt.contract.test.ts` (whole file) — the leak guard Task 7 mirrors, including
  its vacuity assertion and its comment allowance; `stripComments` from `evals/_shared/promptFidelity`.
- `classifyIntent.test.ts:138` — *"still short-circuits an empty message without calling the model"*,
  the unit test that already pins the branch the `early-return` category names.

**Per-task conventions:** TDD loop per task; `pnpm typecheck` + `pnpm check` clean before every
commit; unit tests colocated. **Eval runs cost real money and never run in CI** — a three-sample run
of this set is 51 model calls, about **$0.006**; the tasks that need one say so.

---

## Task 1 — a failing row reports what the node returned, not that it was wrong

- **Contract:** `evals/_shared/score.ts` gains a formatter that renders, for one eval's per-sample
  outcomes, a block naming every row that failed at least one sample: the row id, `passed/samples`,
  the expected `intent`/`reviseTarget` pair, and each **distinct** pair the node actually returned
  with the number of samples that produced it. A row that passed every sample does not appear.
  `intent` wrong, `reviseTarget` wrong and `clarify` returned instead of either are three defects
  with three different repairs, and a rate cannot tell them apart.
- **Test:** `evals/_shared/score.test.ts` — a row failing every sample with one distinct actual; a
  row failing some samples with two distinct actuals, both listed with counts; a row passing every
  sample absent from the output; empty input renders nothing rather than a bare header.
- **Files:** `evals/_shared/score.ts`, `evals/_shared/score.test.ts`, `evals/courseAI/classifyIntent.eval.ts`
- **AC:** spec.md §Intent routing — *"A failing row prints what the node returned, not merely that it
  was wrong."*
- **Commit:** `test(evals): print what a classifier returned, not only that it was wrong`

- [x] Write the failing test · [ ] Run it, see it FAIL (no such formatter) · [ ] Implement
- [x] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 2 — every row is drawn three times, and the prose that counts single-sample evals moves with it

- **Contract:** `runClassifyIntentEval` draws each row `SAMPLES = 3` times, collapses the draws with
  `rowStability`, and prints the always-failing and flaky blocks in the shape `tutor.eval.ts` uses.
  Because `sampledEvals()` reads the **constant** and not a list, the eval leaves the single-sample
  register the moment that constant lands — which reddens `docFigures.contract.test.ts` until
  `ai-eval-strategy.md` says *eight* in both pinned places. That coupling is the mechanism working,
  not an obstacle, and closing it is part of this task.
- **Test:** `evals/_shared/docFigures.contract.test.ts` — already written, and it is the proof: red
  on the constant alone, green after `docs/specs/ai-eval-strategy.md:108` and `:366` are corrected.
  No new test is added here.
- **Files:** `evals/courseAI/classifyIntent.eval.ts`, `docs/specs/ai-eval-strategy.md`
- **AC:** spec.md §Intent routing — *"The run reports a rate per row, not one draw."*
- **Commit:** `test(evals): draw every classifyIntent row three times`

- [x] Add the constant, run `pnpm test:unit`, see `docFigures` FAIL (the count moved, the prose did not)
- [x] Implement the sampling and the two stability blocks · [ ] Correct both prose lines
- [x] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

> **Known intermediate state:** between this task and Task 3 the run still pools 60 samples through
> `accuracyGate`, so its own percentage is not yet a meaningful number. The unit suite is green; the
> eval's gate is not to be quoted until Task 3 lands.

---

## Task 3 — the gate stands on the rows the model actually classified

- **Contract:** each row carries a category **derived from the node's own short-circuit condition** —
  `early-return` when the row has no history or no user message, `classified` otherwise — and the run
  gates with `categoryGate` at `{ classified: 0.85, "early-return": 1 }`. Derived, never stored in the
  JSONL: a category field would be a second copy of what `history: []` already says and would disagree
  with the predicate the first time either moved. Today that split is 3 rows and 17 rows, and the 15
  points those three rows contribute stop being counted as the model's.
- **Test:** `evals/courseAI/classifyIntentRows.test.ts` — rows 01, 09 and 20 derive `early-return`;
  the other seventeen derive `classified`; a row with history but an empty `userMessage` derives
  `early-return`; over the real dataset the split is exactly 3 / 17.
- **Files:** `evals/courseAI/classifyIntentRows.ts` (new — loader + category derivation),
  `evals/courseAI/classifyIntentRows.test.ts` (new), `evals/courseAI/classifyIntent.eval.ts`
- **AC:** spec.md §Intent routing — *"The gate stands on the rows the model actually classified."*
- **Commit:** `test(evals): gate classifyIntent on the rows the model classified`

- [x] Write the failing test · [ ] Run it, see it FAIL (no derivation module) · [ ] Implement
- [x] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 4 — a row that never passes fails the run, whatever the rate says

- **Contract:** `evals/_shared/score.ts` gains a floor over row stability: a run fails when any row in
  a **gated** category passes zero of its samples, even if that category's rate clears its threshold.
  A rate alone lets a permanently broken row hide behind drift on its neighbours; this is what makes
  "rows 15 and 19 never pass" a failure rather than a rounding difference. A row in an ungated
  category that never passes does not redden the run — the floor follows the category, exactly as
  `categoryGate` does.
- **Test:** `evals/_shared/score.test.ts` — seventeen rows where two never pass while the pooled rate
  is still 0.86 → fails, and the failure names those two rows; the same set with every row passing at
  least once → passes; a never-passing row in an ungated category → does not fail the run.
- **Files:** `evals/_shared/score.ts`, `evals/_shared/score.test.ts`, `evals/courseAI/classifyIntent.eval.ts`
- **AC:** spec.md §Intent routing — *"The run gates on two numbers, not one."*
- **Commit:** `test(evals): a row that never passes is a defect, not drift`

- [x] Write the failing test · [ ] Run it, see it FAIL (no floor exists) · [ ] Implement
- [x] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 5 — the run proves it made the calls it claims

- **Contract:** the run compares the recorder's finished-call count against the number of samples the
  `classified` category claims, and **fails when it saw fewer**. This is the `assessCompletion`
  defect (P2) stated as a check: there, zero model calls produced a printed "100%", because nothing
  connected the score to the measurement having happened. More calls than samples is a retry, not a
  defect, and is reported as a note rather than a failure.
- **Ordering constraint, from the anchors:** `reportRunUsage` drains `takeCalls()`
  (`evals/_shared/usage.ts:237`), so the count is taken **before** that call.
- **Test:** `evals/_shared/usage.test.ts` on a pure helper — fewer calls than claimed fails and names
  the shortfall; equal passes; more passes with a note; **zero calls against a non-empty claim fails**,
  which is the case that would have caught P2.
- **Files:** `evals/_shared/usage.ts`, `evals/_shared/usage.test.ts`, `evals/courseAI/classifyIntent.eval.ts`
- **AC:** spec.md §Intent routing — supports *"The gate stands on the rows the model actually
  classified"*: the check is what makes the split honest rather than declared.
- **Commit:** `test(evals): a run that classified nothing cannot report a score`

- [x] Write the failing test · [ ] Run it, see it FAIL (no coverage helper) · [ ] Implement
- [x] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 6 — measure, then decide (no code)

- **Contract:** with the instrument fixed, run `pnpm eval courseAI:classifyIntent` **three times** and
  record, per failing row, what the node returned. The plan's working premise is that rows 15, 16 and
  19 return `continue` where `revise` is expected. **If they return `clarify`, or return `revise` with
  the wrong target, the repair in Task 8 is a different repair** — rewrite that task before executing
  it, not after. This is the step the `confidence_score` reopening made mandatory: one measurement
  comes before the fix, and may cancel it.
- **Test:** none — this *is* the measurement. **Cost: 3 × 51 calls ≈ $0.018.**
- **Files:** none.
- **AC:** the sequencing discipline in spec.md §Intent routing — the measurement precedes the prompt.
- **Commit:** `docs(course-builder): what the fixed instrument reports before the prompt moves`

- [x] Run three times · [ ] Record per-row expected vs actual and the flaky/always-failing split
- [x] Confirm or refute the premise, in writing · [ ] Rewrite Task 8 if refuted · [ ] Commit

---

## Task 7 — the prompt may not be written around this golden set

- **Contract:** the guard `confidence_score` already has, for this node: every value the set carries
  (`userMessage` and each `history[].content`), of at least two words and six characters, must not
  appear in `classifyIntent.ts` with comments stripped. A row quoted in a doc comment is a note to the
  next reader; the same words inside the prompt are a lookup table with a model attached. Written
  **before** the prompt moves, so the fix is made under it rather than checked against it afterwards.
- **Test:** `evals/courseAI/classifyIntentPrompt.contract.test.ts` — the extraction yields enough
  literals for the check to mean anything (vacuity guard, floor taken from the real count); none of
  them appear in the node today; a pasted row value is caught; the same words inside a comment are
  allowed.
- **Files:** `evals/courseAI/classifyIntentPrompt.contract.test.ts` (new)
- **AC:** spec.md §Intent routing — *"The prompt may not name this golden set either."*
- **Commit:** `test(courseAI): keep the intent set out of the prompt it grades`

- [x] Write the failing test · [ ] Run it, see it FAIL (paste a row value into a scratch source to
      prove it bites) · [ ] Implement · [ ] Run it, see it PASS
- [x] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 8 — the prompt closes the class without pulling the other direction over

- **Contract:** an addition aimed at an **earlier** step routes to a `revise` of that step however
  tentatively it is phrased; content belonging to the step **being collected** stays `continue`. Rows
  15, 16 and 19 pass all three samples; rows 11, 02 and 10 pass all three; the `classified` category
  holds ≥ 85% and no row fails all three samples. The prompt string at
  `classifyIntent.ts:103` is the only thing that moves — no schema, no threshold, no graph edge.
- **Test:** the eval, run three times, is the measurement (**≈ $0.018**). The existing
  `classifyIntent.test.ts` suite must stay green — `ALREADY STORED`, the field→step resolution and
  the `fallback_triggered` assertions are untouched — and Task 7's contract test must stay green
  with the new wording.
- **Files:** `server/services/courseAI/graph/nodes/classifyIntent.ts`
- **AC:** spec.md §Intent routing — *"The class the prompt has to close"* and *"The opposite direction
  may not regress, and it is the same lever."*
- **Commit:** `fix(courseAI): route a tentative addition by the step it names`

- [x] Baseline recorded (Task 6) · [ ] Edit the prompt · [ ] `pnpm test:unit` green
- [x] Three eval runs · [ ] Both directions hold, or the trade-off is written down
- [x] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

> **If both directions cannot be held at this set size**, the honest outcome is a recorded trade-off
> in spec.md — which direction was chosen, at what measured cost — **not** a prompt tuned until one
> run comes out green. The first pass already regressed row 11 by pushing on this exact class; a
> second silent regression would be the same mistake with a better score attached.

---

## Task 9 — the documents say what was measured

- **Contract:** three stale or missing claims are corrected. `../spec.md` §Performance carries the
  node's prompt token count **after** the change beside the 559 before it.
  `docs/tech-review-prep/area-4/perf-report.md` §9 and `docs/tech-review-prep/area-4/area-4.md` stop
  reporting P3 as *"80.0%, and nobody had changed this prompt"* — that 80% was taken **before** PR
  #138 landed the same day, unchanged code since then measures 90/85/80, and the real defect was the
  instrument. `area-4.md`'s P3 line moves to what P3 now is.
- **Test:** `pnpm test:unit` (`docFigures` and `specSections` stay green), then `pnpm spec:sync`.
- **Files:** `docs/specs/features/ai-course-builder/spec.md`,
  `docs/tech-review-prep/area-4/perf-report.md`, `docs/tech-review-prep/area-4/area-4.md`
- **AC:** Gate Docs (DoD) — `documentation-process.md` §7.
- **Commit:** `docs(area-4): P3 was measured on a prompt that had already been fixed`

- [x] Update the three documents · [ ] `pnpm test:unit` green · [ ] `pnpm spec:sync` · [ ] Commit

---

## Why the plan is thin

A plan carrying full implementation code only pays for itself when a *cheaper* model executes it.
Here the executor is the same model that wrote the plan, so the feature gets generated twice — once
as code inside markdown, once as code — and the two drift. Contracts and test names are enough to
execute from, and the compiler and the tests catch what prose cannot. — ADR-030.

**The exception, and it is narrow:** include code when the exact form of the code *is* the thing
being approved — a non-trivial migration, a change on the money or crypto path, a guard regex where
a mistake is expensive. **No task here takes it.** Task 8's prompt wording is the one candidate and
is deliberately excluded: its exact form is decided by Task 6's measurement, and freezing wording in
the plan before that measurement exists is how a fix gets written around the set instead of around
the behaviour.

## Self-review (run before handoff)

| Acceptance criterion (spec.md §Intent routing) | Task |
|---|---|
| The run reports a rate per row, not one draw | 2 |
| The gate stands on the rows the model actually classified | 3, and 5 makes it honest |
| The run gates on two numbers, not one | 4 |
| A failing row prints what the node returned | 1 |
| The class the prompt has to close (rows 15, 16, 19) | 8, premise verified by 6 |
| The opposite direction may not regress (rows 11, 02, 10) | 8 |
| The set size is accepted here, not solved here | — no task by design; the dataset gains no rows |
| The prompt may not name this golden set either | 7 |
| *(harness spec)* the single-sample register and its machine-read count | 2 |
| Gate Docs — spec, perf-report, area-4 corrected | 9 |

- **Guarded coverage:** `pnpm classify` names no authority and no control, so there is no security
  task. Stated in **Track** rather than left as an absence.
- **Contract clarity:** every task states an observable behaviour and the test that proves it.
- **Type consistency:** `CategoryEvalResult`, `RowStability` and `EvalCall` are used with the names
  and shapes `score.ts:3`, `score.ts:5` and `usage.ts:30` already define; no task renames them.

## Final verification

- `pnpm typecheck`, `pnpm check`, `pnpm test:unit`, `pnpm test:integration` — all green.
- `pnpm eval courseAI:classifyIntent` three times: `classified` ≥ 85% in each, `early-return` at
  100%, no row failing all three samples, and the call-coverage line reporting no shortfall.
- **Break each new check on purpose and watch it redden** — a test that never fails proves nothing:
  drop `SAMPLES` back to 1 and see `docFigures` fail; put a dataset literal into the prompt and see
  Task 7's contract test fail; stub the node to return `continue` unconditionally and see Task 4's
  floor fail rather than the rate quietly absorbing it.
- The eval's own report, read once end to end, says the same thing the spec says: which rows are
  stable, which are flaky, what the node returned for the ones that failed, and what the run cost.
