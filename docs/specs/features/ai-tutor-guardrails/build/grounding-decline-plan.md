# Grounding's Denial Class Implementation Plan

> **For agentic workers:** execute with `superpowers:executing-plans` in this session — the warm
> context is the cheapest place to run TDD loops (ADR-030). Dispatch a subagent only for work that
> *reads a lot and returns little*; reconnaissance goes to `Explore`, never `general-purpose`.
> Steps use checkbox (`- [x]`) syntax. See [`../spec.md`](../spec.md) for the design and Acceptance
> criteria — scope item 16, "Grounding's denial class".

**Goal:** stop `check_not_grounded` from firing the zero-baseline security alert on cooperative
traffic, and give the model a refusal it can act on so the turn recovers inside the agent loop.

**Architecture:** one rule changes class. `authorizeAskConceptCheck` keeps its rule order and keeps
refusing an ungrounded check; what changes is which helper it refuses through — `decline` instead of
`deny` — and therefore which outcome is emitted (`tool_call_declined`, unforwarded) and which message
returns to the model. Grounding stays a **per-turn** property; the alternative, scoping it to the
conversation, was rejected in `spec.md` because a check authored on turn 20 would then count as
grounded by a retrieval on turn 1 and the rule would mean nothing.

**Track:** `guarded` — control change. `pnpm classify` on the spec-only diff reports *"No new
authority and no control touched"* because no source has changed yet; `scripts/classify-change.ts:141`
matches `/toolPolicy\.ts$/` as a **control** signal, so the verdict becomes
*"Guarded (control change): no new authority, so skip the design pass — point one auditor at the
modified control, and require a false-positive check on legitimate input"* as soon as Task 1 lands.
**Re-run `pnpm classify` at `/qa` against the real diff**, and dispatch `llm-security-auditor` in
`audit` mode over `toolPolicy.ts` with that false-positive requirement. No new authority: no new
tool, procedure, route, model, migration or environment variable.

**Codebase anchors (verified during planning):**

- `deny(ctx, ruleId)` (`server/services/lessonAI/toolPolicy.ts:72`) — emits `unsafe_tool_call` and
  returns `NEUTRAL_REFUSAL_MESSAGE`. The helper `check_not_grounded` currently uses.
- `decline(ctx, ruleId, message)` (`server/services/lessonAI/toolPolicy.ts:93`) — emits
  `tool_call_declined` and returns the caller's own message. The helper it moves to. Its docstring
  already states the dividing line ("whether the call is evidence of an ATTACK, not whether it
  failed") and names authority, grounding and rendered markup as staying on `deny` — that sentence
  is what this change edits.
- `MALFORMED_CHECK_MESSAGE` (`server/services/lessonAI/toolPolicy.ts:110`) — the deliberately shared
  text for every well-formedness rule, so a validator cannot be binary-searched. The new message sits
  beside it and must **not** be it.
- `if (!ctx.groundedByRetrieval) return deny(ctx, "check_not_grounded");`
  (`server/services/lessonAI/toolPolicy.ts:177`) — the single call site.
- `emitDenial` (`server/services/lessonAI/toolPolicy.ts:48`) — dedupes per **outcome** via
  `TurnDenialLedger`, so a model that retries inside one turn produces one event, not five. Moving
  the outcome moves which bucket that dedupe applies to; no change needed.
- `FORWARD_TO_SENTRY` (`server/services/_shared/aiGuard/securityLog.ts:16,31`) — `unsafe_tool_call:
  true`, `tool_call_declined: false`. The forwarding difference this change is for. **Not edited**:
  the map is per-outcome, and both outcomes already exist.
- `ROUTINE_RULE_IDS` (`server/services/lessonAI/toolPolicy.test.ts:226`) — the set the table-driven
  case at `:243` uses to decide whether a rule's message must equal `NEUTRAL_REFUSAL_MESSAGE`.
  `check_not_grounded` joins it.
- `["check_not_grounded", wellFormed, { groundedByRetrieval: false }]`
  (`server/services/lessonAI/toolPolicy.test.ts:114`) — the rule-id case; the id does not change, so
  this entry stays.
- `it("reports an ungrounded check as an unsafe call")`
  (`server/services/lessonAI/toolPolicy.test.ts:387`) — asserts `outcomes()` is `["unsafe_tool_call"]`
  and the exact returned object. This is the test that must go red first.
- `it("logs only the first failing rule when several would deny")`
  (`server/services/lessonAI/toolPolicy.test.ts:247`) — unallowlisted **and** ungrounded, asserting
  only the rule id. Extended in Task 3 to assert the outcome too.
- `ask_concept_check` description (`server/services/lessonAI/tools/askConceptCheck.tool.ts:94`) —
  already ends *"Requires having called retrieve_lesson_context on this turn."* This is why the new
  message discloses nothing new.
- `measureAuthoring` (`evals/lessonAI/tutor.eval.ts:250`) — calls the real
  `authorizeAskConceptCheck` with `groundedByRetrieval: true` hardcoded, deliberately, to isolate the
  structural rules. **Do not change it**; the new rows measure grounding through `tools_called`.
- `row.input.history` (`evals/lessonAI/tutorDataset.ts:132`, consumed at
  `evals/lessonAI/tutor.eval.ts:344`) — prior turns are prepended to the agent's messages, so a
  "grown thread" is expressible as data.
- `evals/datasets/lessonAI/tutor.jsonl` — JSONL, one row per line; `legit-mastery` already exists as
  a category (4 rows) and is where these belong. Baseline: `evals/baselines/lessonAI-tutor.json`.

**Per-task conventions:** after the implement step, `pnpm typecheck` and `pnpm check` must be clean
before committing. Unit tests are colocated `*.test.ts`. No behaviour is added outside the tasks
below — the announce-a-question defect, MQ-4's question quality, and stale lesson chunks are named in
`manual-qa.md` and are **out of scope here**.

---

## Task 1 — an ungrounded check is declined, not alerted on

- **Contract:** `authorizeAskConceptCheck` on a turn with `groundedByRetrieval: false` still returns
  `authorized: false`, but emits `tool_call_declined` with rule id `check_not_grounded`, and its
  message names the call the model must make first. That message is neither
  `NEUTRAL_REFUSAL_MESSAGE` nor `MALFORMED_CHECK_MESSAGE`.
- **Test:** `server/services/lessonAI/toolPolicy.test.ts` — rewrite `:387` to expect
  `["tool_call_declined"]` and the new message (it fails now: the outcome is `unsafe_tool_call`); add
  `check_not_grounded` to `ROUTINE_RULE_IDS` at `:226` so the table case at `:243` stops requiring the
  neutral text; add a case asserting the message is distinct from both shared constants, so a later
  edit cannot quietly collapse it into the malformed-check text and re-hide the rule.
- **Files:** `server/services/lessonAI/toolPolicy.ts`, `server/services/lessonAI/toolPolicy.test.ts`
- **AC:** spec.md item 16, bullets 1–2
- **Commit:** `fix(tutor): decline an ungrounded check instead of alerting on it`

- [x] Write the failing test · [ ] Run it, see it FAIL (`:387` expects `unsafe_tool_call`) · [ ] Implement
- [x] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

> Update `decline`'s docstring at `:93` in the same commit — it currently names grounding as staying
> on `deny`, and a comment that contradicts the code beneath it is how the next reader re-introduces
> this defect.

---

## Task 2 — every authoring rule is pinned to its outcome

- **Contract:** one table test states, for each rule id `authorizeAskConceptCheck` can emit, which
  security outcome it produces. Moving any other rule's class turns it red. Deny:
  `concept_not_allowlisted`, `option_markup`. Decline: `empty_allowlist`, `check_not_grounded`,
  `question_length`, `option_count`, `option_length`, `options_not_distinct`,
  `correct_option_not_offered`, `question_reveals_answer`.
- **Test:** `server/services/lessonAI/toolPolicy.test.ts` — a `describe.each` over that table
  asserting `outcomes()` per rule. It fails before Task 1 for `check_not_grounded` and passes after;
  written here as the guard against **future** widening, which is the acceptance criterion's point.
- **Files:** `server/services/lessonAI/toolPolicy.test.ts`
- **AC:** spec.md item 16, bullet 3
- **Commit:** `test(tutor): pin every authoring rule to the outcome it emits`

- [x] Write the failing test · [ ] Run it, see it FAIL (before Task 1 lands, or by flipping one row) · [ ] Implement
- [x] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 3 — authority still outranks grounding

- **Contract:** a call that is both outside the allowlist and ungrounded reports
  `concept_not_allowlisted` and emits `unsafe_tool_call` — unchanged by Task 1. A caller with no right
  to ask is still refused before anything it wrote is inspected, and still as an attack.
- **Test:** `server/services/lessonAI/toolPolicy.test.ts` — extend `:247` with an `outcomes()`
  assertion. Without it, Task 1 could have reordered the rules and no test would notice.
- **Files:** `server/services/lessonAI/toolPolicy.test.ts`
- **AC:** spec.md item 16, bullet 4
- **Commit:** `test(tutor): assert authority is still decided before grounding`

- [x] Write the failing test · [ ] Run it, see it FAIL (temporarily reorder the two rules to prove it) · [ ] Implement
- [x] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 4 — measure whether a grown thread can still reach a check

- **Contract:** two `legit-mastery` rows in the dataset ask for a concept check on the same lesson —
  one on a short thread, one whose `history` carries several prior turns in which the tutor has
  already retrieved and answered. Both expect
  `tools_called: ["retrieve_lesson_context", "ask_concept_check"]`. The grown-thread row is the
  false-positive check the guarded track requires: it reproduces the condition MQ-2 measured by hand,
  and its rate must not sit below the short-thread control's.
- **Test:** `pnpm eval lessonAI:tutor`. These are dataset rows, not assertions — `legit-mastery` is
  reported per category, and the pair is read as a **difference**, not against a fixed bar. A bar set
  before the first measurement is a guess (this eval's own rationale, `tutor.eval.ts:49`).
- **Files:** `evals/datasets/lessonAI/tutor.jsonl`, `evals/baselines/lessonAI-tutor.json`
- **AC:** spec.md item 16, bullets 5–6
- **Commit:** `test(evals): measure whether a grown thread can still reach a concept check`

- [x] Write the rows · [ ] Run the eval, record both rates · [ ] Update the baseline
- [x] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

> **What these rows cannot do, and it must be said in the note field.** The eval never runs
> `authorizeAskConceptCheck` on the live turn — the `ask_concept_check` stub does not call it
> (`tutor.eval.ts:62`), and `measureAuthoring` holds `groundedByRetrieval: true` on purpose. So these
> rows measure whether the **model** retrieves before authoring on a grown thread, which is the half
> that failed in production. They cannot measure the policy's response to it; Tasks 1–3 do that
> deterministically. Recording that split in the row notes is what stops a future reader reading a
> green category as "grounding is fine".

---

## Task 5 — the ADR

- **Contract:** `docs/adr/034-grounding-is-a-quality-control.md` records the decision and, more
  importantly, the re-pricing: after this change nothing on the security side replaces grounding, and
  `spec.md`'s old claim that it "answers *ask me a check whose answer is banana*" was never true of
  the shipped design (`security.md` §35, now §48). The three-month test is met — a reader in December
  finding `check_not_grounded` on the benign side needs to know it was moved deliberately, on
  measured evidence, and what was given up.
- **Test:** none. `pnpm spec:sync` must run clean.
- **Files:** `docs/adr/034-grounding-is-a-quality-control.md`
- **AC:** the complex-tier Gate Docs requirement (CLAUDE.md §Development Workflow), carried from
  `/spec`.
- **Commit:** `docs(adr): record grounding as a quality control, not a security one`

- [x] Write the ADR · [ ] `pnpm spec:sync` · [ ] Commit

---

## Why the plan is thin

A plan carrying full implementation code only pays for itself when a *cheaper* model executes it.
Here the executor is the same model that wrote the plan, so the feature gets generated twice — once
as code inside markdown, once as code — and the two drift. Contracts and test names are enough to
execute from, and the compiler and the tests catch what prose cannot. — ADR-030.

No task here carries code. The nearest candidate was the new decline message, since its exact wording
is arguably what is being approved — but its content is constrained by the acceptance criteria
(names `retrieve_lesson_context`, is neither shared constant) and pinned by Task 1's test, which is
the stronger form of approval.

## Self-review (run before handoff)

| spec.md item 16 acceptance criterion | Task |
|---|---|
| `check_not_grounded` emits `tool_call_declined`, asserted on the event | 1 |
| Message names `retrieve_lesson_context`; is not `NEUTRAL_REFUSAL_MESSAGE` or `MALFORMED_CHECK_MESSAGE` | 1 |
| Nothing else moves class; full rule→outcome mapping pinned | 2 |
| Rule order unchanged — authority decided before grounding | 3 |
| ~~Eval row: recovery after a decline~~ — **retired**, see below | — |
| Eval row: false-positive check on a grown thread | 4 |
| Baseline category totals match the dataset | audit, task 6 |
| Ungrounded refusal does not ask for a retrieval already tried | audit, task 7 |
| One decline does not suppress a different rule's event | audit, task 7 |
| No `check_not_grounded` occurrence in `unsafe_tool_call` counts | 1 + 2 |
| Complex tier — ADR | 5 |

- **Guarded coverage:** the one control the classifier will name is `toolPolicy.ts`; Tasks 1–3 give it
  three tests, and Task 4 supplies the false-positive check the guarded track demands on legitimate
  input rather than recall alone.
- **Contract clarity:** every task states an observable outcome — which event fires, which message
  returns, which order holds.
- **Type consistency:** no new types. `ToolAuthorization`, `SecurityOutcome` and `TurnDenialLedger`
  are unchanged; only which existing helper the call site uses changes.

## After the audit — what this plan did not foresee

Written after the fact, deliberately not folded back into Tasks 1–5 as though it
had been planned. `/qa` ran one code review and one `llm-security-auditor` pass
(`GUARDED`, control change), and between them they moved three things.

**Task 6 — the baseline, and the test that should have caught it.** Task 4 listed
`evals/baselines/lessonAI-tutor.json` in its Files and left the checkbox unticked.
The reasoning was recorded in the commit and not here, which was the actual
mistake: a plan step skipped silently is indistinguishable from one forgotten.
The reasoning was that re-recording freezes an unexplained `off-topic` drop
(66.7% → 50.0%) that nothing on this branch can cause — `guardUserInput` does not
run in this eval and `toolPolicy` is not on that path.

The audit answered it. `compareToBaseline` reports a category by its **rate**, so
`legit-mastery` growing from four rows to six while both runs score 100% produces
12/12 against 18/18 and prints **nothing**. The category grew by half and the diff
was silent, and no contract test noticed: `docFigures` pins `rows × samples` and
the prose row count, never the per-category totals a comparison is made of. So the
baseline is re-recorded, the drop is written into `security.md` where prose
survives what a diff cannot, and `datasets.contract.test.ts` now asserts every
committed baseline's category totals against the dataset rows they were recorded
against — derivable from files already in the repo, and red on this branch before
the re-record.

**Task 7 — two consequences of the change itself**, both from the audit, both now
in `spec.md`'s acceptance criteria: the denial ledger keyed on outcome alone, so
the recovery path this change makes common swallowed the second attempt's
structural rule; and the actionable message is unsatisfiable on a lesson with no
indexed chunks, where it instructs a retry that loops to `AGENT_RECURSION_LIMIT`.

**The recovery criterion is retired, not deferred.** It asked for an eval row
measuring "author ungrounded → declined → retrieve → author again". The harness
cannot produce it honestly, and the reasons are in `spec.md`. The claim is checked
in production instead, by the prediction added to S11: `check_not_grounded`'s share
should fall toward zero, and a flat share falsifies it. Leaving the criterion
written and unbuilt was the one option the gate does not allow.

## Final verification

- `pnpm typecheck`, `pnpm check`, `pnpm test:unit`, `pnpm test:integration` — all green.
- `pnpm eval lessonAI:tutor` — run before merging, per CLAUDE.md; record both new rows' rates and
  update `evals/baselines/lessonAI-tutor.json`.
- `pnpm classify` re-run against the real diff; expect `Guarded (control change)`. Dispatch
  `llm-security-auditor` in `audit` mode over `toolPolicy.ts` at `/qa`.
- **Break Task 2's table on purpose** — flip one rule from decline to deny and see it go red. A
  mapping test that never fails proves nothing, and this one exists solely to catch a future edit.
- **Manual, and it is the only end-to-end evidence:** re-run `manual-qa.md` MQ-2 on the pinned lesson
  without pressing Clear — grow the thread past the length at which the failure was measured, ask for
  a check, and confirm a panel appears. Record the result in that row; a green eval does not settle
  it, because the eval's stub never runs the policy.
