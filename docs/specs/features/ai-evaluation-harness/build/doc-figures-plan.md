# Pin the figures `docFigures` cannot derive — Implementation Plan

> **For agentic workers:** execute with `superpowers:executing-plans` in this session — the warm
> context is the cheapest place to run TDD loops (ADR-030). Dispatch a subagent only for work that
> *reads a lot and returns little*; reconnaissance goes to `Explore`, never `general-purpose`.
> Steps use checkbox (`- [ ]`) syntax. See [`../spec.md`](../spec.md) for the design and Acceptance
> criteria.

> **Executed 2026-09-05.** Kept as history, not updated (`documentation-process.md` §1a). Sibling to
> [`plan.md`](plan.md), which is the frozen build history of the judge and must not be overwritten —
> the shape `ai-tutor-guardrails/build/` already uses for a reopened feature.

**Goal:** close the two classes of documented claim that `docFigures.contract.test.ts` structurally
cannot see — a figure measured over a corpus it does not read, and a measurement that describes a
mechanism the code no longer has — then fix the three documents currently carrying both.

**Architecture:** no new module. `evals/_shared/docFigures.ts` already owns two mechanisms — *pinned
figures* (derived exactly, the document must carry the derived number) and *dated narrative* (no test
can judge the prose, so the document must carry a reconciliation date no older than the baseline).
Both new checks are instances of those two, applied to sources the module does not currently read:
the pinned half widens from `TutorFigures` to a second corpus, and the dated half gains a
*measurement* date distinct from the existing *reconciliation* date. The contract test grows three
`describe` blocks; nothing outside `evals/_shared/` and three markdown files changes.

**Track:** `standard`.

```
$ pnpm classify
No changes against 080324ae306e.
```

The tree was clean, so the classifier had nothing to read — an honest verdict, not a useful one.
Assessed against `documentation-process.md` §3a by the files the work touches
(`evals/_shared/docFigures.{ts,contract.test.ts}` plus three documents): **no new authority** — no
tool, graph node, AI entry point, tRPC procedure, route handler, Prisma model, migration, environment
variable, nor any touch of the money path; **no modified control** — `docFigures` is a CI check, not a
boundary a request crosses, and the AI guard, output boundary, tool authority and procedure
authorization are untouched. §3a question 2 is *yes* (this adds acceptance criteria to
`ai-evaluation-harness`), so: **standard**. No threat pass; controls inherited by reference from
[`ai-tutor-guardrails/security.md`](../../ai-tutor-guardrails/security.md) **S6** and
[ADR-022](../../../../adr/022-ai-input-trust-boundary.md), recorded in `spec.md` §Security with the
reconfirmation for this reopening. **Re-run `pnpm classify` before `/qa`** — it can classify a real
diff, which it could not do at `/spec`.

**No `code-explorer` was dispatched.** Every anchor below was read directly in this session and is
cited by line. A cold explorer would re-read the same four files to return what is already held, which
is the dispatch the constitution names as paying for context twice (§Agent economics, ADR-030). The
scope is two source files and three documents; there is no new architecture for `code-architect`
either.

**Codebase anchors (verified during planning, 2026-09-05):**

- `TutorFigures` (`evals/_shared/docFigures.ts:30`) — the only figure source a pinned claim can read.
  Every field derives from the tutor dataset or its baseline, which is precisely why the
  `aiGuard:indirect` denominator is invisible to the module. Task 1 widens what a claim receives.
- `PinnedClaim` (`docFigures.ts:263`), whose `expected` is `(figures: TutorFigures) => string[]`
  (`:270`) — the signature that has to widen; `PINNED_CLAIMS` (`:283`) is the registry, `pinnedClaims`
  (`:359`) the mapper the test consumes (`docFigures.contract.test.ts:162`).
- `datasetRows(file)` (`docFigures.ts:53`) — already generic over any `.jsonl` path; ignores a missing
  trailing newline. Task 1 needs no new counter, only a path constant and a wider figures object.
- `RECONCILED` (`docFigures.ts:215`), `reconciledOn` (`:218`), `isStale` (`:227`) — the existing
  date-marker machinery: a regex over `forMatching`ed prose, a nullable getter, a comparison that
  treats *absent* as stale. Task 2's measurement-date marker copies this shape exactly rather than
  inventing a second style.
- `RECONCILED_DOCS` (`docFigures.ts:233`) — the five documents in scope for criteria 13, 14 and 14a.
- `forMatching` (`docFigures.ts:200`) — joins markdown-wrapped lines but keeps table rows and
  paragraph breaks intact (`docFigures.contract.test.ts:186-204`). **Every new prose matcher must go
  through it**; a matcher reading the file as written fails on a reflow and trains everyone to loosen
  the pattern instead of fixing the figure.
- `strategyMapCells` (`docFigures.ts:248`) — the precedent for scoping a matcher to one `## ` section
  by splitting on `/^## /m` and selecting by prefix. Task 3 scopes to §7 the same way, which matters:
  §7 is where the before/after items live and §3 already has its own rules.
- `asWord` (`docFigures.ts:189`) / `capitalized` (`:191`) — for figures the prose spells out.
- Test shapes to copy: the claim-registry block (`docFigures.contract.test.ts:161`), the staleness
  block (`:96`), and the registry-honesty block (`:206`) whose "catches a figure that drifted" case
  proves the check can fail. Each new check needs its own equivalent of that last one.
- **The module's own docstring already names this gap** (`docFigures.contract.test.ts:20-44`): it
  lists "a tool was renamed while the strategy still named the old one" among the incidents that
  motivated the file, and closes *"The first only catches the figures I already know to look for."*
  The class was on the record and unchecked — that sentence is the plan's justification in one line.
- `ALLOWED_TOOL_NAMES` (`server/services/lessonAI/toolPolicy.ts:20`) — the four current names, read at
  test time by Task 5. Read-only; this plan does not touch `server/`.
- **Targets.** `docs/specs/ai-eval-strategy.md:254-256` (the `aiGuard:indirect` item, undated, quotes
  a 12-row denominator) and `:260-266` (the mastery-clause table, undated, columns read *"write
  refused"* / *"write correctly granted"* — **no tool name anywhere in it**);
  `docs/specs/features/ai-tutor-guardrails/security.md:523-530` (S13 §3, same denominator) and
  `:103`, `:586` (the two `mark_concept_understood` references, both already historical prose).
- **`security.md` S13 §39 (`:964-971`) already records the discrepancy** — *"S13 §3's headline …
  now describes a sixteen-row dataset with no recorded baseline of its own"* — and adds a fact that
  matters for scope: `ind-13`–`ind-16` run in a harness with **no tools and its own prompt**, so they
  measure prose-level compliance, not the controls they name. The register knew; the headline did
  not, and no test held it there. That asymmetry is what this plan removes.
- `evals/datasets/aiGuard/indirect.jsonl` — **16 rows**; `ind-13`–`ind-16` added in `2cbda8e`
  (2026-08-29), after the published measurement of 2026-08-09 (`6768f57`). They have never been run
  in the raw/wrapped A/B.
- `evals/datasets/datasets.contract.test.ts:1-25` — the precedent for a floor that applies to every
  golden set regardless of surface.

**Per-task conventions:** unit and contract tests are colocated and run in `pnpm test:unit` (no
network, no key); after the implementation step `pnpm typecheck` and `pnpm check` must be clean before
committing; every task is a red→green→commit loop and no task is left with the suite red. Tasks 3, 4
and 5 each begin red **against the real documents** — that is the point of them, and the prose fix
belongs to the same task so the suite is never committed failing.

---

## Task 1 — a pinned claim can quote a figure from a corpus other than the tutor set

- **Contract:** `pinnedClaims` receives a figures object that carries the `aiGuard:indirect` corpus
  size alongside `TutorFigures`, derived by `datasetRows` from `evals/datasets/aiGuard/indirect.jsonl`
  at call time. A claim can therefore assert a number this module previously had no way to read. No
  existing claim changes shape or value.
- **Test:** `evals/_shared/docFigures.contract.test.ts` — the indirect corpus size equals
  `datasetRows` of that path and is greater than zero; every existing pinned claim still resolves to
  the same expected values it did before (the widening is additive); and the registry-honesty case
  is extended so a drifted indirect count produces different expectations, proving the new figure can
  fail.
- **Files:** `evals/_shared/docFigures.ts`, `evals/_shared/docFigures.contract.test.ts`
- **AC:** spec.md #13
- **Commit:** `test(evals): let a pinned claim read a corpus the module could not see`

- [x] Write the failing test · [ ] Run it, see it FAIL (no indirect figure exists to assert) · [ ] Implement
- [x] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 2 — a measurement date is parseable, and partial coverage is decidable

- **Contract:** two pure helpers, mirroring `reconciledOn` / `isStale`. The first reads a
  `measured <YYYY-MM-DD>` marker out of a passage and returns `null` when there is none; the second
  answers whether a measurement covered fewer rows than its corpus now holds. Both operate on
  `forMatching`ed text, so a marker wrapped across two markdown lines still reads, and neither is
  wired to a document yet.
- **Test:** `evals/_shared/docFigures.contract.test.ts` — a marker on one line; the same marker
  reflowed mid-sentence; a passage with no marker returns `null`; another date in the prose is not
  mistaken for the marker (the existing staleness block has this case for `RECONCILED` and it earned
  its place); coverage equal to the corpus is complete, coverage below it is partial, and a corpus
  that has not grown since the run is not reported as partial.
- **Files:** `evals/_shared/docFigures.ts`, `evals/_shared/docFigures.contract.test.ts`
- **AC:** spec.md #15
- **Commit:** `test(evals): read a measurement date, and say when a run covered less than its corpus`

- [x] Write the failing test · [ ] Run it, see it FAIL (helpers do not exist) · [ ] Implement
- [x] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 3 — every before/after measurement in `ai-eval-strategy.md` §7 states when it was measured

- **Contract:** the contract test scopes to §7 the way `strategyMapCells` scopes to §3, finds each
  numbered before/after item, and fails any that carries no measurement date. Both current items gain
  one: the `aiGuard:indirect` A/B is dated 2026-08-09, and the mastery-clause table is dated and
  labelled as measuring the write tool ADR-033 removed — the columns keep their figures, which are
  correct measurements of the system that existed then.
- **Test:** `evals/_shared/docFigures.contract.test.ts` — §7 yields at least two items (a section that
  matched nothing must not pass silently, the defect P2 and the `classifyIntent` repair both turned
  on); every item carries a date; and a synthetic §7 with an undated item fails, so the check is
  shown able to go red.
- **Files:** `evals/_shared/docFigures.contract.test.ts`, `docs/specs/ai-eval-strategy.md`
- **AC:** spec.md #14
- **Commit:** `docs(evals): date the two before/after measurements, and hold them there`

- [x] Write the failing test · [ ] Run it, see it FAIL (**both real items are undated** — this is
  position 10 reproducing) · [ ] Date both items in §7 · [ ] Run it, see it PASS
- [x] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 4 — the indirect denominator names the rows it covered and the rows the set holds now

- **Contract:** the two sentences quoting the wrap A/B — `ai-eval-strategy.md` §7 item 1 and
  `security.md` S13 §3 — each carry the historical denominator (12, the rows the 2026-08-09 run
  covered) **and** the current corpus size, and the second is pinned to `indirect.jsonl` rather than
  typed. The published ratio does not move: re-running is a separate task, both because it changes a
  number three documents quote and because S13 §39 records that the four added rows run in a
  different harness, so a 16-row figure would average two measurement conditions.
- **Test:** `evals/_shared/docFigures.contract.test.ts` — a pinned claim per document, each matching
  once and resolving its corpus figure from the dataset; growing the dataset by one row changes both
  expectations, so the claim cannot be satisfied by a stale number that happens to still be written
  down.
- **Files:** `evals/_shared/docFigures.ts`, `evals/_shared/docFigures.contract.test.ts`,
  `docs/specs/ai-eval-strategy.md`, `docs/specs/features/ai-tutor-guardrails/security.md`
- **AC:** spec.md #13, #15
- **Commit:** `docs(evals): say which rows the wrap A/B measured, and pin the rest to the set`

- [x] Write the failing test · [ ] Run it, see it FAIL (**both sentences quote 12 against a 16-row
  set** — this is position 9 reproducing) · [ ] Rewrite both sentences · [ ] Run it, see it PASS
- [x] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 5 — a retired tool name cites the ADR that retired it

- **Contract:** any `snake_case` name matching the shape of an agent tool, appearing in the five
  documents of `RECONCILED_DOCS`, is either one of `ALLOWED_TOOL_NAMES` or sits in a sentence naming
  the ADR that removed it. `security.md`'s two references to `mark_concept_understood` gain
  `ADR-033`; nothing else in those documents is affected.
- **Test:** `evals/_shared/docFigures.contract.test.ts` — the four current tool names are accepted
  wherever they appear; a synthetic sentence naming a retired tool without an ADR fails; the same
  sentence with the ADR passes; and the detector finds at least one real name in the corpus, so a
  regex that matches nothing cannot pass as compliance.
- **Files:** `evals/_shared/docFigures.ts`, `evals/_shared/docFigures.contract.test.ts`,
  `docs/specs/features/ai-tutor-guardrails/security.md`
- **AC:** spec.md #14a
- **Commit:** `test(evals): a tool name that no longer exists must cite the ADR that removed it`

- [x] Write the failing test · [ ] Run it, see it FAIL (two references cite no ADR) · [ ] Add the
  citations · [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Why the plan is thin

A plan carrying full implementation code only pays for itself when a *cheaper* model executes it.
Here the executor is the same model that wrote the plan, so the feature gets generated twice — once
as code inside markdown, once as code — and the two drift. Contracts and test names are enough to
execute from, and the compiler and the tests catch what prose cannot. — ADR-030.

**The exception, and it is narrow:** include code when the exact form of the code *is* the thing
being approved — a non-trivial migration, a change on the money or crypto path, a guard regex where
a mistake is expensive. When you do, say so on the task line: `code included: <reason>`.

No task here takes the exception. The regexes in tasks 2, 3 and 5 are prose matchers over
repo-owned documents, not guard patterns over hostile input: a mistake makes CI red, not a hole.

## Self-review (run before handoff)

**Spec coverage** — every acceptance criterion added or changed by this reopening maps to a task:

| AC | Criterion, in short | Task |
|---|---|---|
| 13 (extension) | a figure over a non-tutor corpus is pinned to that corpus's row count | 1, 4 |
| 14 | every §7 before/after measurement states its measurement date | 3 |
| 14a | a retired tool name cites the ADR that removed it | 5 |
| 15 | a figure measured over fewer rows than the corpus now holds says so | 2, 4 |

Criteria 1–12 and the original half of 13 are unchanged by this reopening and stay covered by the
tests already listed in `spec.md` §Test & eval scenarios; no task touches their behaviour.

**Guarded coverage** — not applicable. `pnpm classify` names no authority and no control (see
**Track**), the feature adds no route, procedure, model, migration or environment variable, and
`spec.md` §Security records the inherited controls and the reconfirmation rather than assuming them.
No security-derived acceptance criterion exists for this reopening, so there is none to map.

**Contract clarity** — each task states an observable behaviour: a claim can read a second corpus; a
marker parses; §7 items carry dates; two sentences carry two figures; a retired name cites its ADR.
None says "update X".

**Type consistency** — the widened figures object introduced in Task 1 is the same object tasks 2 and
4 consume; `PinnedClaim.expected` changes signature exactly once, in Task 1, and every later task uses
the widened form. No rename mid-plan.

**A correction made during planning, recorded rather than smoothed over.** The criterion written at
`/spec` as AC 14 required tool names in the five documents to exist in `ALLOWED_TOOL_NAMES` or carry a
historical marker. Checked against the actual target, it **would not have fired**: the mastery-clause
table names no tool at all — its columns read *"write refused"*, *"write correctly granted"* — so the
check would have passed the one instance it was written for while flagging two already-correct
sentences in `security.md`. That is the same failure this feature exists to remove: a check that looks
like it covers a class and does not reach the instance. AC 14 was rewritten to the measurement-date
rule, which is derivable and fires on both §7 items today; the tool-name rule survives as 14a on its
own merits, with its weakness stated.

## Final verification

- `pnpm typecheck`, `pnpm check`, `pnpm test:unit` — all green.
- `pnpm test:integration` — unchanged by this work; run once to confirm no collateral.
- **Break each new check on purpose and watch it go red**, then restore — a test that never fails
  proves nothing, and three of the five tasks exist because a check that could not fail was reported
  as a pass:
  - delete the measurement date from one §7 item → Task 3's check red;
  - add a row to `indirect.jsonl` → Task 4's pinned claims red;
  - rename a tool in one `security.md` sentence → Task 5's check red;
  - set the indirect corpus figure to a wrong constant → Task 1's registry-honesty case red.
- Re-read §7 and S13 §3 once by hand after the edits: the figures are historical and must still read
  as *true statements about the run that produced them*, not as hedged ones. Dating a measurement is
  not the same as doubting it.
- `pnpm classify` on the real diff before `/qa`, since it had nothing to read at `/spec`.


---

## What executing this changed against the plan

Recorded because the plan is history and history that hides its corrections is worth less than none.

1. **Task 1 lost one of its three stated tests, on purpose.** The plan asked for a registry-honesty
   case proving a drifted indirect count changes expectations. No claim consumed that figure until
   Task 4, so the case could not exist yet and would have asserted nothing. It was written in Task 4
   instead, beside the claims it guards.

2. **The measurement marker had to become case-insensitive, and the first real marker is why.** It
   opened its sentence — `Measured 2026-08-18, against a tutor that still held a write tool` — and the
   case-sensitive regex read it as absent, turning the check red on a document that *did* say when.
   Loosening a pattern is what this module warns against, so the reasoning is on the record: the word
   and an ISO date immediately after it are both still required, and sentence-initial capitalisation
   is a property of English rather than a loophole. The case that caught it is pinned.

3. **Task 5 was narrowed from a shape to a registry, and it is weaker for it.** The plan said any
   tool-shaped `snake_case` name must be current or cite an ADR. Run against the real corpus that
   flagged **seventeen** names — `unsafe_tool_call`, `guard_off_topic`, `system_prompt_echo`,
   `tools_not_called` — because security-event outcomes, rule ids and dataset fields wear exactly the
   same shape as a tool name and no regex over the name alone separates them. `RETIRED_TOOL_NAMES` is
   an explicit registry instead: exact, no false positives, and it catches a retired tool **only if
   someone registered it**. That limitation is stated in the module rather than discovered later, and
   it is the reason criterion 14 is a date — the dating rule is what covers the tool nobody
   remembered to register.

4. **The check caught this feature's own Agent notes.** A sentence added at `/spec` named
   `mark_concept_understood` without citing ADR-033 — and was also wrong about the table it described,
   claiming §7 labels its columns with that tool when the table names no tool at all. Both were fixed
   under Task 5. The mechanism firing on its author's own prose the same day it shipped is the
   strongest evidence available that it checks something real.

5. **Sentence scoping earned itself on the first run.** The ADR citation initially landed in the
   sentence *before* the one naming the tool, and the check still failed. That is correct: a reader of
   this sentence learns nothing from a citation in the last one.

6. **`build/plan.md` was overwritten and restored.** The first draft of this plan was written to
   `plan.md`, destroying the judge's frozen build history. Caught by `git diff` during final
   verification and restored from HEAD; the plan moved here. §1a says a plan is kept and never
   updated — the failure was writing to the path rather than beside it.
