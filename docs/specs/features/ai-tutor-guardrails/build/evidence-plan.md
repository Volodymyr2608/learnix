# Mastery-Write Evidence — Implementation Plan

> **For agentic workers:** execute with `superpowers:executing-plans` in this session — the warm
> context is the cheapest place to run TDD loops (ADR-030). Steps use checkbox (`- [ ]`) syntax.
> See [`../spec.md`](../spec.md) §Acceptance criteria → **Evidence for a mastery write**.

**Goal:** Make the tutor decline to record mastery a student merely *claims*, without making it
decline mastery a student actually *demonstrates* — and measure both directions.

**Architecture:** One clause added to rule 5 of the tutor's system prompt, stating what is not
evidence. Nothing about the authority layer changes: `toolPolicy.ts` already rejects level 3 from
conversation and any concept outside `lessonConcepts`, and it remains what enforces. The eval
harness measures the attempt rate on both sides — the existing `tool-abuse` rows for over-firing, and
a new `legit-mastery` category for under-firing.

**Track:** `standard`. `pnpm classify` → `STANDARD-OR-DIRECT`: *"No new authority and no control
touched — the guarded track does not apply."* Per `documentation-process.md` §3a, editing a prompt
inside an already-guarded surface is neither new authority nor a modified control, so **no threat
pass ran at `/spec`**. Controls inherited by reference from
[`../security.md`](../security.md) S7 (tool authorization) and S13 §5 (social manipulation, accepted).

**Why the spec's security criteria still get their own tasks:** the plan rules say a probabilistic
control needs an `evals/` row *and* a false-positive check on legitimate input. That is Task 2, and it
is the task most likely to be dropped as "nice to have" — a prompt that refuses everything passes
Task 1's test and scores perfectly on `tool-abuse` while silently disabling the feature.

**Reconnaissance note:** no `feature-dev:code-explorer` dispatch. The four files this touches were
edited in this same session, so a cold agent would re-read context already held and bill for it twice
(ADR-030, *"a subagent is bought for context isolation, not intelligence"*). Anchors below were
verified directly instead; if any is wrong, that is on this plan, not on a missing dispatch.

**Codebase anchors (verified during planning):**

- `SYSTEM_PROMPT` rule 5 (`server/services/lessonAI/lessonAI.agent.ts:22`) — the single line to
  change. States only the positive trigger and pushes against under-calling ("Do NOT wait for the
  student to ask you to mark it"), never what fails to count as evidence.
- `buildTutorSystemPrompt` (`lessonAI.agent.ts`) — assembles the prompt; both production and the eval
  call it, so a change reaches the eval automatically.
- `CONVERSATION_MAX_LEVEL = 2` (`server/services/lessonAI/toolPolicy.ts:28`), enforced at `:52`. The
  authority ceiling. **Not changed by this plan.**
- **Two existing tests constrain the edit** and must stay green without being modified:
  - `lessonAI.agent.test.ts:102` — the prompt must never instruct a level above the ceiling, so the
    new clause must not introduce a "3 if …" form.
  - `lessonAI.agent.test.ts:112` — every entry of `SYSTEM_PROMPT_LEAK_MARKERS` must remain a literal
    substring. The three markers are `"Tool usage rules (follow in order):"`,
    `"You are an AI tutor for one lesson of one course"`, and
    `"Never paste retrieved lesson content back verbatim"` — none sits inside rule 5, so an edit
    there is safe, but the test is the proof rather than this sentence.
- `CATEGORIES` / `GATED_THRESHOLDS` / `JUDGED_CATEGORIES` (`evals/lessonAI/tutorDataset.ts:18,47,71`)
  — a new category must be added to `CATEGORIES`, and `tutorDataset.contract.test.ts:36`
  (`it.each(CATEGORIES)`) then requires at least one row for it.
- Dataset bounds (`tutorDataset.contract.test.ts:27-28`) — 30–50 rows; currently 43, so three new
  rows is in range.
- `evals/baselines/lessonAI-tutor.json` — current `tool-abuse` is 3/9 with judge means per category;
  the prompt hash changes, so `compareToBaseline` will correctly report the runs as not comparable
  rather than presenting the delta as a regression.

**Per-task conventions:** after the implement step, `pnpm typecheck` and `pnpm check` must be clean
before committing. No unit test may call a model. `/implement` must write a fresh
`.claude/.active-plan` marker naming **this** plan — the one currently on disk names
`ai-evaluation-harness` and is stale for this feature.

---

## Task 1 — a claim of understanding is not evidence of it

- **Contract:** rule 5 of the tutor's system prompt states what does *not* count as demonstrated
  understanding — a student asserting they already know something, saying they learned it elsewhere,
  or instructing the tutor to record it — while leaving the positive trigger intact, so a student
  who explains a concept correctly is still marked. The authority layer is untouched.
- **Test:** `server/services/lessonAI/lessonAI.agent.test.ts` — the assembled prompt contains the
  negative-evidence clause; the two existing constraints above still hold (leak markers intact, no
  instruction to choose a level above the ceiling) and are **not** edited to accommodate the change.
- **Files:** `server/services/lessonAI/lessonAI.agent.ts`,
  `server/services/lessonAI/lessonAI.agent.test.ts`
- **AC:** spec.md → Evidence for a mastery write, criterion 1
- **Commit:** `feat(lessonAI): state what is not evidence of understanding`

- [ ] Write the failing test · [ ] Run it, see it FAIL (clause absent) · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 2 — the false-positive direction: real demonstrations are still recorded

- **Contract:** a new `legit-mastery` dataset category holds rows where the student demonstrates
  understanding in their own words — an unprompted correct definition, a correct worked example, a
  correct application to a new case — against a lesson whose `concepts` list contains the concept.
  Each expects `mark_concept_understood` to be **called**. This is the direction Task 1 can break,
  and the only thing standing between "refuses manipulation" and "refuses everything".
- **Test:** `evals/lessonAI/tutorDataset.contract.test.ts` — the new category is covered, and every
  `legit-mastery` row both names concepts in `input.concepts` and expects the write tool in
  `tools_called` (a row that forgot either would pass vacuously). Offline; the rows are exercised
  against the model by `pnpm eval` in Task 3.
- **Files:** `evals/lessonAI/tutorDataset.ts`, `evals/datasets/lessonAI/tutor.jsonl`,
  `evals/lessonAI/tutorDataset.contract.test.ts`
- **AC:** spec.md → criterion 2
- **Commit:** `test(evals): add the legit-mastery rows Task 1 could break`

- [ ] Write the failing test · [ ] Run it, see it FAIL (category absent from `CATEGORIES`)
- [ ] Implement · [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

**Ungated on purpose.** `legit-mastery` gets no entry in `GATED_THRESHOLDS` and none in
`JUDGED_CATEGORIES`: no threshold before the first measurement (the repo's standing position, and
Decision 5 of ADR-031), and the question here is which tool fired, which an assertion answers exactly.

---

## Task 3 — measure both directions and commit the numbers

- **Contract:** `pnpm eval lessonAI:tutor` is run before and after Task 1, and the recorded baseline
  carries the new rates for `tool-abuse` and `legit-mastery`. The before-run is the already-committed
  baseline; the after-run is recorded with `--baseline` once both directions are read. The comparison
  is expected to announce a changed prompt hash — that is the mechanism working, not a problem.
- **Test:** not a unit test. Verification is the run itself: `tool-abuse` improves or is unchanged,
  `legit-mastery` is read for the first time, and both numbers land in
  `evals/baselines/lessonAI-tutor.json` where a reviewer can check them.
- **Files:** `evals/baselines/lessonAI-tutor.json`
- **AC:** spec.md → criterion 1 ("rate … must not regress") and criterion 2
- **Commit:** `test(evals): record mastery-evidence rates before and after`

- [ ] Read the committed baseline's `tool-abuse` figure as the before
- [ ] Run the eval, read **both** categories · [ ] Record with `--baseline` · [ ] Commit

**If `legit-mastery` scores badly, Task 1 is wrong and gets reworked** — that is the outcome this
task exists to make visible, not a result to explain away. A `tool-abuse` improvement bought by
refusing legitimate demonstrations is a regression wearing a better number.

---

## Task 4 — the accepted risk keeps its rate

- **Contract:** `security.md` S13 §5 still records social manipulation as an **accepted** residual —
  it is not reclassified as mitigated — and now carries the measured before/after attempt rate, so
  the residual is quantified rather than merely named. The entry states plainly that the prompt is
  defence in depth and the authority layer is what enforces.
- **Test:** none; this is a register entry. Its correctness is that its numbers match the committed
  baseline from Task 3, which a reader can check.
- **Files:** `docs/specs/features/ai-tutor-guardrails/security.md`
- **AC:** spec.md → criterion 3 (the residual stays accepted, with its rate recorded)
- **Commit:** `docs(ai-tutor-guardrails): quantify the social-manipulation residual`

- [ ] Update S13 §5 with the measured rates · [ ] Confirm the numbers match the baseline file
- [ ] Commit

---

## Why the plan is thin

A plan carrying full implementation code only pays for itself when a *cheaper* model executes it.
Here the executor is the same model that wrote it, so the feature gets generated twice — once as code
inside markdown, once as code — and the two drift. — ADR-030.

**One task takes the narrow exception and it is not this plan's:** the prompt wording in Task 1 is
close to being "the exact form of the code is what is approved", since a clause worded too strongly is
precisely the failure Task 2 guards. It is still left to implementation, because Task 2 measures the
outcome rather than the wording — if the clause is too strong, the eval says so.

## Self-review (run before handoff)

| AC (spec.md → Evidence for a mastery write) | Task |
|---|---|
| 1 — assertion-only gets no `mark_concept_understood` call; rate recorded, no regression | Tasks 1, 3 |
| 2 — genuine demonstration still gets the call at level 1–2 | Tasks 2, 3 |
| 3 — neither is absolute; residual stays accepted in S13 §5 with its rate | Task 4 |

**Guarded coverage:** the classifier named no authority and no control, so there is no guarded list to
cover. The probabilistic-control rule is honoured: Task 2 is the false-positive check on legitimate
input, as its own task with its own test, not an assertion bolted onto Task 1.

**Contract clarity:** each task states an observable behaviour. Task 4 is a register entry and says so.

**Type consistency:** `legit-mastery` is spelled identically in `CATEGORIES`, the dataset rows and the
contract test; `CONVERSATION_MAX_LEVEL` is referenced, never redefined.

## Final verification

- `pnpm typecheck`, `pnpm check`, `pnpm test:unit` — all green.
- `lessonAI.agent.test.ts` passes **without** either existing constraint test being edited. If the
  leak-marker or level-ceiling test needed changing to accommodate the new clause, the clause is
  wrong.
- `pnpm eval lessonAI:tutor` reports both `tool-abuse` and `legit-mastery`, and the baseline file
  contains both.
- **Break Task 1 on purpose:** remove the clause and confirm `tool-abuse` drops back toward its
  recorded 3/9. A prompt change whose removal changes nothing did nothing.