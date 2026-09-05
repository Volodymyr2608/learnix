# Confidence calibration (P1) — Implementation Plan

> **For agentic workers:** execute with `superpowers:executing-plans` in this session — the warm
> context is the cheapest place to run TDD loops (ADR-030). Dispatch a subagent only for work that
> *reads a lot and returns little*; reconnaissance goes to `Explore`, never `general-purpose`.
> Steps use checkbox (`- [ ]`) syntax. See [`../spec.md`](../spec.md) §"Confidence calibration" for
> the design and Acceptance criteria.

**Goal:** Make `confidence_score` meet its own gate — of the steps it scores `≥ 0.8`, at least 85%
are genuinely complete — without buying that precision by refusing to advance.

**Architecture:** The defect is a floor rule inside one prompt string
(`confidenceScore.ts:61`), which fires on any non-empty field and beats the band written for generic
titles. The fix is that prompt. Two supporting changes make the fix provable rather than assertable:
the eval gains a second gate so precision cannot be won by scoring everything low, and a contract
test forbids the prompt from naming the golden set it is measured against. No node, no route, no
schema and no threshold moves.

**Track:** `standard`. `pnpm classify` reports `No changes against c646ab2ace03` (nothing written
yet); back-tested over the last commit touching this node it returns **`STANDARD-OR-DIRECT` — "No new
authority and no control touched"**. `documentation-process.md` §3a rules the case directly: editing
a prompt inside an already-registered entry point is neither new authority nor a modified control, so
no design pass ran and the surface's controls are inherited by reference (`spec.md` §Security,
`server/services/_shared/conformance/aiSurfaces.ts`). There is no security task below because there
is no security delta — and the change direction is toward *withholding* auto-advance, which persists
strictly less.

**Codebase anchors (verified during planning):**

- `CONFIDENCE_THRESHOLD = 0.8` (`server/services/courseAI/graph/nodes/confidenceScore.ts:12`) — the
  cut point. **Frozen by AC; no task touches it.**
- The prompt literal (`…/confidenceScore.ts:48-66`) — `Guidelines:` at `:59`, the floor rule at
  `:61` (*"If EXTRACTED DATA has all required fields … score at least 0.85"*), the chat-length rule
  at `:66`. Task 3 rewrites this block and nothing else in the file.
- `accuracyGate(label, results, threshold)` (`evals/_shared/score.ts:104`) — returns `passed/total`,
  and **`0` for an empty set** (`:110`), so the fully-degenerate collapse already fails. Its sibling
  `precisionGate` (`:126`) returns **`1`** on an empty set (`:137`) — a vacuous pass. Task 2 must not
  switch to it.
- `runConfidenceScoreEval` (`evals/courseAI/confidenceScore.eval.ts:29`) — builds `raw` (`:45`), the
  `highConf` subset (`:103`), and returns one `accuracyGate` (`:107`). Registered as
  `courseAI:confidenceScore` in `evals/runEvals.ts:30`.
- `usageRecorder()` (`evals/_shared/usage.ts:130`) and `recorder.config` — already threaded into the
  node call (`confidenceScore.eval.ts:39`, `:70`); Task 1 reuses it, adds no cost accounting.
- `stripComments(source)` (`evals/_shared/promptFidelity.ts:11`) — strips comments so a prompt quoted
  in a doc comment is not a finding. Task 4 reuses it verbatim; `promptFidelity.contract.test.ts` is
  the shape to copy for a source-reading contract test.
- `confidenceScoreDataset.contract.test.ts` — pins the set's *authorship* (no verdict words, no draft
  counts, step-filter noise on both label classes). Task 4 is its sibling in the other direction:
  that test keeps the answer out of the data, this one keeps the data out of the prompt.
- `evals/_shared/score.test.ts` — where the gate helpers are unit-tested; Tasks 1 and 2 extend it.

**Per-task conventions:** `pnpm typecheck` + `pnpm check` clean before every commit. Unit tests are
colocated `*.test.ts` and run in CI; **evals are not in CI** (`CLAUDE.md`) — they are run by hand and
their numbers are pasted into the task's commit message, because a figure nobody recorded is a figure
nobody can regress against.

---

## Task 1 — The score distribution is visible, and it decides whether this plan proceeds

- **Contract:** `pnpm eval courseAI:confidenceScore` prints one line per row — id, score, expected
  label, and whether it is a false positive — ordered by score descending. Reading it answers the
  question the plan is built on: whether the four false positives sit *below* the true rows (a cut
  point that is merely mis-placed, which a prompt can fix) or *among* them (a broken ranking, which
  no prompt wording and no threshold can separate).
- **Test:** `evals/_shared/score.test.ts` — `formatScoreTable` is a pure function over
  `{ id, score, expected }[]`: it orders by score descending, marks rows scoring `≥ 0.8` with
  `expected: false` as false positives, and renders a stable column layout. Cases: mixed set ordered
  correctly; a false positive marked and a true positive not; an empty set renders a header and no
  rows rather than throwing.
- **Files:** `evals/_shared/score.ts`, `evals/_shared/score.test.ts`,
  `evals/courseAI/confidenceScore.eval.ts`
- **AC:** spec.md §Test & eval scenarios — *"One measurement comes before the fix, and may cancel
  it"*
- **Commit:** `test(evals): print what confidenceScore actually scores, row by row`

- [ ] Write the failing test · [ ] Run it, see it FAIL (`formatScoreTable` is not exported)
- [ ] Implement · [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit
- [ ] **Run `pnpm eval courseAI:confidenceScore` and paste the table into the commit body.**

> **Decision point — do not skip.** If any false positive outscores any `expected.complete` row, the
> ranking is broken, Task 3 cannot succeed as written, and the plan **stops here**: that is a
> different defect (the node needs a different signal, not different wording) and it goes back through
> `/spec`. Record the finding either way — a confirmed ranking is what licenses Task 3.

---

## Task 2 — Precision can no longer be won by refusing to advance

- **Contract:** the eval fails unless **both** hold: precision among `≥ 0.8` predictions is `≥ 0.85`,
  **and** at least **10 of the 11** `expected.complete` rows are still scored `≥ 0.8`. A run that
  scores three rich rows high and everything else low — 100% precision, eight completable steps sent
  to a manual Accept — fails, where today it passes.
- **Test:** `evals/_shared/score.test.ts` — the new `retentionGate(label, results, floor)`:
  passes at 10 retained, fails at 9, and **the anti-gaming case**: a result set with 3 true positives,
  0 false positives and 8 dropped true rows fails retention while precision reads 100%. Plus one
  regression case pinning that `accuracyGate` still returns `0`, not `1`, on an empty set — the hole
  `precisionGate` has and this gate must not inherit.
- **Files:** `evals/_shared/score.ts`, `evals/_shared/score.test.ts`,
  `evals/courseAI/confidenceScore.eval.ts`
- **AC:** spec.md — *"Caution is not bought by refusing to advance"*, *"The two numbers together
  leave exactly one degree of freedom"*
- **Commit:** `test(evals): gate confidenceScore on both numbers, not one`

- [ ] Write the failing test · [ ] Run it, see it FAIL (`retentionGate` does not exist)
- [ ] Implement · [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit
- [ ] **Run the eval: it must now report both numbers and fail on precision (73.3%), not on
      retention (11/11).** A red run that fails the *wrong* number means the gate is wrong, not the
      prompt.

---

## Task 3 — Field presence stops counting as specificity

- **Contract:** the `confidence_score` prompt scores the *content* of `draftStepData`, not the
  presence of its keys. A step whose required fields are all present but whose values are single
  words or default titles scores below 0.8; a step with substantive values keeps its score. The
  guarantee that a complete field set floors the score at 0.85 is gone, and the chat-length rule no
  longer reads as an instruction to discount thin data.
- **Test:** `pnpm eval courseAI:confidenceScore` — the gate from Task 2, run before and after. Before:
  precision **73.3% (11/15)**, false positives `04, 06, 08, 18`, retention 11/11. After: precision
  **≥ 85%** with **at most one** false positive surviving, and retention **≥ 10/11**. Paste both runs
  into the commit body. Run it **twice** after the change: one draw of a 20-row set is not a result,
  and the pre-fix figure was confirmed twice for the same reason.
- **Files:** `server/services/courseAI/graph/nodes/confidenceScore.ts` (the prompt block, `:48-66`)
- **AC:** spec.md — *"The node meets its own gate"*, *"A placeholder never auto-advances"*,
  *"Field presence is not specificity"*, *"The prompt is the only lever this reopening moves"*
- **Commit:** `fix(courseAI): score what the draft says, not that its fields exist`

- [ ] Run the eval, record the FAIL (73.3%, four false positives) · [ ] Rewrite the guidelines block
- [ ] Run the eval, see both gates PASS · [ ] Run it a second time, confirm the direction holds
- [ ] `pnpm typecheck` + `pnpm check` clean · [ ] `pnpm vitest run server/services/courseAI` green
- [ ] Commit

> **Constraints on this task, from the spec:** `CONFIDENCE_THRESHOLD` stays `0.8`; the node's inputs,
> its `wrapUntrustedContent` calls and its four-label JSDoc block stay as they are (the last is
> enforced by `graphContract.contract.test.ts`); the golden set is not edited, row 08 keeps
> `complete: false`.

---

## Task 4 — The prompt cannot be taught the answers

- **Contract:** no literal drawn from `evals/datasets/courseAI/confidenceScore.jsonl` appears in the
  node's prompt text. The rule is mechanical: every string value in a row's `draftStepData` and every
  `history` message, normalised for whitespace and case, of **at least two words and six characters**
  — `"Learn Python"`, `"Section 1"`, `"use AWS"`, `"some experience"` — must not occur in
  `confidenceScore.ts` with comments stripped. Four of the twenty rows are the ones Task 3 fixes, so
  without this a prompt that memorises them passes the gate while fixing nothing.
- **Test:** `evals/courseAI/confidenceScorePrompt.contract.test.ts` — one case per extracted literal
  over the real source file (not a copy). Two cases prove the test can fail: a fixture string
  containing `"Learn Python"` is rejected, and a fixture where the same words appear only inside a
  `//` comment is accepted (that is what `stripComments` is for). One case pins that the extraction
  found a non-trivial number of literals, so a future dataset reshape cannot silently empty the check.
- **Files:** `evals/courseAI/confidenceScorePrompt.contract.test.ts`
- **AC:** spec.md — *"The prompt may not name the golden set"*
- **Commit:** `test(courseAI): keep the golden set out of the prompt it grades`

- [ ] Write the failing test · [ ] Run it, see it FAIL (paste a dataset literal into the prompt
      on purpose to prove the check bites) · [ ] Remove the paste, implement the extraction
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 5 — The spec says what was measured, not what was hoped

- **Contract:** `spec.md` carries the after-figure from Task 3 next to the before-figure, its
  frontmatter returns to `status: stable`, and `_index.md` is regenerated. The `## Agent notes` line
  about quoting this node's accuracy gains the third number, so the file records **three** measurements
  on three different questions (pre-repair 91.7%, post-repair 73.3%, post-fix N%) rather than letting
  a reader assume the last one was always true.
- **Test:** `pnpm spec:sync` leaves no diff after it is committed; `pnpm vitest run evals` green.
- **Files:** `docs/specs/features/ai-course-builder/spec.md`,
  `docs/specs/features/_index.md`
- **AC:** Gate Docs (`documentation-process.md` §7) — the DoD for this reopening
- **Commit:** `docs(course-builder): record what the calibration fix measured`

- [ ] Update spec.md with both figures · [ ] `status: in-progress → stable` · [ ] `pnpm spec:sync`
- [ ] `pnpm test:unit` green · [ ] Commit

---

## Why the plan is thin

A plan carrying full implementation code only pays for itself when a *cheaper* model executes it.
Here the executor is the same model that wrote the plan, so the feature gets generated twice — once
as code inside markdown, once as code — and the two drift. Contracts and test names are enough to
execute from, and the compiler and the tests catch what prose cannot. — ADR-030.

**The one place this plan came close to the exception** is Task 4's extraction rule, where a
too-loose match makes the contract test fire on ordinary English and a too-tight one lets
`"use AWS"` through. It is stated as a rule with its bounds (two words, six characters, case- and
whitespace-insensitive, comments stripped) rather than as code, because the bounds are the thing
being approved and the code is one `filter`.

**No `code-architect` dispatch, and no `code-explorer` either.** The surface is five files, four of
them read in full while writing the spec, and the anchors above carry their real line numbers. A
reconnaissance agent would re-read them cold to reach the same place — the exact case
`docs/constitution.md` §Agent economics names ("executing a task whose context the caller already
holds pays for that context twice").

## Self-review (run before handoff)

**Spec coverage** — every Acceptance criterion in `spec.md` §"Confidence calibration" maps to a task:

| Acceptance criterion | Task |
|---|---|
| The node meets its own gate (precision ≥ 85%) | 3, gated by 2 |
| A placeholder never auto-advances (rows 04, 06, 08, 18 < 0.8) | 3 |
| Caution is not bought by refusing to advance (≥ 10 of 11 retained) | 2 |
| The two numbers leave one degree of freedom (k ≤ 1) | 2 (gate), 3 (met) |
| Field presence is not specificity | 3 |
| The prompt is the only lever (`CONFIDENCE_THRESHOLD` frozen) | 3 (constraint block) |
| The prompt may not name the golden set | 4 |
| An instructor asking for a stub still gets Accept (row 08) | 3 (constraint block: set not edited) |
| One measurement precedes the fix and may cancel it | 1 |
| Gate Docs | 5 |

**Guarded coverage** — the classifier named no authority and no control, so there is no control task;
the reason is recorded in **Track** above rather than left implicit.

**Contract clarity** — every task states an observable outcome. Task 1's outcome is a *recorded
figure*, which is why it carries a decision point instead of a pass/fail gate.

**Type consistency** — `formatScoreTable` (Task 1) and `retentionGate` (Task 2) are both new exports
of `evals/_shared/score.ts`, both taking the existing `{ id, score, expected }` row shape that
`confidenceScore.eval.ts:73` already builds. No task renames `EvalResult`.

## Final verification

- `pnpm typecheck`, `pnpm check`, `pnpm test:unit`, `pnpm test:integration` — all green.
- `pnpm eval courseAI:confidenceScore` — both gates pass, run twice, both figures in the commit body.
- `pnpm eval courseAI:assessCompletion` and `courseAI:extractStepData` — unchanged, confirming the
  rewrite did not disturb the neighbouring classifiers through shared expectations.
- **Break Task 4's contract test on purpose**: paste `"Learn Python"` into the prompt, see it go red,
  revert. A test that never fails proves nothing.
- **Break Task 2's retention gate on purpose**: hand it a 3-of-11 result set in the unit test and see
  it fail while precision reads 100%. That case is the whole reason the gate is two-sided.
