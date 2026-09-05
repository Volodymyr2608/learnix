# Intent routing (P3) — Implementation Plan

> **For agentic workers:** execute with `superpowers:executing-plans` in this session — the warm
> context is the cheapest place to run TDD loops (ADR-030). Dispatch a subagent only for work that
> *reads a lot and returns little*; reconnaissance goes to `Explore`, never `general-purpose`.
> Steps use checkbox (`- [ ]`) syntax. See [`../spec.md`](../spec.md) §"Intent routing" for the
> design and Acceptance criteria.

**Goal:** `classify_intent` stops guessing which step holds the field an instructor wants changed,
and the two answers it cannot get from a prompt — which step, and whether anything is stored yet —
become inputs it is given.

**Architecture:** The model returns the **field**; the step is resolved from
`getExtractionSchemaForStep`'s own shapes, so a step that does not hold the field cannot be returned.
The rule "supplying content for the current step is `continue`" stops being a sentence the model has
to read correctly and becomes data on the prompt: the keys the step has already stored. A swallowed
model error emits `fallback_triggered` instead of disappearing into a default. Nothing about the
graph's shape, the revise path, or persistence moves.

**Track:** `standard`. `pnpm classify` reports `No changes against 9781acf` (nothing written yet) and
the intended file set trips no signal: `classifyIntent.ts` and a new pure resolver are not a new
`.addNode(`, not an entry point, not a tool, not a control under `aiGuard/`. Editing a prompt and its
output schema inside an already-registered entry point is neither new authority nor a modified
control (`documentation-process.md` §3a), so no design pass ran and §Security's controls are
inherited by reference. There is no security task below because there is no security delta — Task 4
*adds* a security event rather than changing a boundary.

**Codebase anchors (verified during planning):**

- `classifyIntent` (`server/services/courseAI/graph/nodes/classifyIntent.ts:27`) — `withNodeErrors`
  wrapper, `(state, config)`. Early return at `:30` for empty history/message (17 model calls on 20
  rows). `outSchema` at `:12` carries `intent`, `reviseTarget` (the `DraftStep` enum), `reason`.
  The `catch` at `:81` returns `continue` and is what Task 4 instruments.
- `getExtractionSchemaForStep(step)` (`server/services/courseAI/validators/getExtractionSchemaForStep.ts:6`)
  — four `z.object`s. Top-level keys: `basic` → title, subtitle, description, category, level,
  language, duration; `objectives` → objectives; `requirements` → requirements; `curriculum` →
  sections. **Section and lesson titles are nested inside `sections[]`, not top-level**, so `title`
  resolves uniquely to `basic`. This function is the map; Task 1 reads its `.shape`, it does not
  restate it.
- `routeByIntent` (`server/services/courseAI/graph/graph.ts:45`) and the edge at `:124` —
  `revise → revise_prior_field`, `clarify → chat_response`. Unchanged by this plan.
- `revisePriorField` (`…/nodes/revisePriorField.ts:23`) — `if (!state.reviseTarget) return
  { assistantText: "I couldn't tell which field to revise." }`. That string is the dead end Task 2
  makes unreachable. **The node itself is out of scope** (see spec §Failure & fallback).
- `logSecurityEvent` (`server/services/_shared/aiGuard/securityLog.ts:45`) and the emit shape at
  `guardUserInput.ts:99-106` — `{ feature, userId, layer, outcome, ruleIds, score }`, optional
  `subject`. `fallback_triggered` forwards to Sentry (`securityLog.ts:17`), which is the point: this
  outcome's baseline is zero.
- `runClassifyIntentEval` (`evals/courseAI/classifyIntent.eval.ts:38`) asserts `out.intent` **and**
  `out.reviseTarget`. The node keeps writing `reviseTarget`, so **the eval and its dataset do not
  change** — before and after are the same measurement, which is what makes the comparison mean
  anything.
- Model stubbing pattern: `vi.mock("@langchain/openai", () => ({ ChatOpenAI: class {} }))`
  (`server/observability/aiLogShape.contract.test.ts:150`, `lessonAI.agent.test.ts:10`).

**Per-task conventions:** `pnpm typecheck` + `pnpm check` clean before every commit. Unit tests
colocated `*.test.ts`. Evals are **not** in CI — run by hand, and the figures go in the commit body,
because a number nobody recorded is a number nobody can regress against.

---

## Task 1 — The step is derived from the schema, and the derivation is checked against it

- **Contract:** `stepForField(field)` returns the `DraftStep` whose extraction schema declares that
  key at the top level, or `null` when no schema does. It reads `getExtractionSchemaForStep(...).shape`
  for each step — there is no literal list of field names anywhere in the module.
- **Test:** `server/services/courseAI/validators/stepForField.test.ts` — `level`, `title`, `duration`
  → `basic`; `objectives` → `objectives`; `requirements` → `requirements`; `sections` →
  `curriculum`; an unknown key → `null`. Two cases carry the design rather than the examples:
  **(a)** every top-level key of all four schemas resolves to the step it came from — generated from
  the schemas, so a field added tomorrow is covered without editing the test; **(b)** no key appears
  in two schemas, which is the property that makes resolution unique. If (b) ever fails, the answer
  is a different strategy, not a tie-break — say so in the test's comment.
- **Files:** `server/services/courseAI/validators/stepForField.ts`, `…/stepForField.test.ts`
- **AC:** spec.md — *"The model names the field; the step is derived, not guessed"*, *"The field→step
  map is derived from the schemas, never hand-maintained"*
- **Commit:** `feat(courseAI): resolve a revise target from the schema that holds the field`

- [x] Write the failing test · [x] Run it, see it FAIL (`stepForField` does not exist)
- [x] Implement · [x] Run it, see it PASS · [x] `pnpm typecheck` + `pnpm check` clean · [x] Commit

---

## Task 2 — An unholdable step is unreturnable, and a nameless target is a question

- **Contract:** `classify_intent`'s structured output carries `reviseField: string | null` in place of
  the `DraftStep` enum. On `revise`, the node resolves the field through `stepForField` and writes
  the result to `reviseTarget`. **When the field does not resolve, the turn becomes `clarify`** with
  the question in `reason` — the node never emits `revise` with a null target, so
  `revise_prior_field`'s *"I couldn't tell which field to revise"* branch is unreachable from here.
  `continue` and the empty-message early return behave exactly as before.
- **Test:** `server/services/courseAI/graph/nodes/classifyIntent.test.ts`, model stubbed per the
  anchor above. Cases: a resolvable field returns `revise` + the owning step; an unresolvable field
  returns `clarify` with a non-empty `reason` and `reviseTarget: null`; `continue` passes through
  untouched with `reviseTarget: null`; the empty-`userMessage` path still short-circuits without
  calling the model.
- **Files:** `server/services/courseAI/graph/nodes/classifyIntent.ts`, `…/classifyIntent.test.ts`
- **AC:** spec.md — *"The three measured failures pass by construction"*, *"An unresolvable field is
  a `clarify`, never a null target"*
- **Commit:** `fix(courseAI): classify the field, not the step`

- [x] Write the failing test · [x] Run it, see it FAIL (`reviseField` is not in the schema)
- [x] Implement · [x] Run it, see it PASS · [x] `pnpm typecheck` + `pnpm check` clean
- [x] `pnpm vitest run server/services/courseAI` green · [x] Commit

---

## Task 3 — "Nothing is stored yet" is an input, not a sentence to be read correctly

- **Contract:** the prompt states which keys the **current** step has already stored, computed as
  `Object.keys(state.content)` intersected with that step's schema keys. When the intersection is
  empty the prompt says so explicitly, and the guidance that follows is that supplying content for a
  step storing nothing is `continue`. The wording that made this a judgement call — *"whether from an
  earlier step or the current step"*, with "add a bonus section" as its example — is replaced by the
  stored-versus-being-collected distinction the spec states.
- **Test:** same file as Task 2. This is an **input contract**, so it is asserted as one: with an
  empty `content` the prompt names no stored keys and says nothing is stored; with `content` holding
  `title` and `level` on the `basic` step, both appear. Behaviour is not asserted here — whether the
  model then answers `continue` is what the eval in Task 5 measures, and pretending a stub proves it
  would be the fiction `promptFidelity` exists to prevent.
- **Files:** `server/services/courseAI/graph/nodes/classifyIntent.ts`, `…/classifyIntent.test.ts`
- **AC:** spec.md — *"Supplying content for a step that has stored nothing is `continue`"* and the
  Edge case that pins row 02
- **Commit:** `fix(courseAI): tell the classifier what the step has already stored`

- [x] Write the failing test · [x] Run it, see it FAIL (the prompt carries no stored-key line)
- [x] Implement · [x] Run it, see it PASS · [x] `pnpm typecheck` + `pnpm check` clean · [x] Commit

---

## Task 4 — A swallowed model error stops being invisible

- **Contract:** the `catch` in `classify_intent` emits `logSecurityEvent` with
  `outcome: "fallback_triggered"`, `layer: "model_call_fallback"`, `feature: "courseAI"`,
  `userId: state.instructorId`, `ruleIds: ["classify_intent_unavailable"]`, `subject:
  { kind: "generation", id: state.generationId }` — **and still returns `continue`**. Failing open is
  the documented behaviour and does not change; what changes is that it now leaves a trace, on an
  outcome whose baseline is zero and which forwards to Sentry.
- **Test:** same file. Cases: a throwing model produces exactly one event with those fields **and**
  `intent: "continue"` (fail-open preserved — the event must not become a new failure path); a
  successful call emits nothing. No message text, reply text or prompt reaches the event — the shared
  type has no field for it, and the test asserts the emitted object's keys.
- **Files:** `server/services/courseAI/graph/nodes/classifyIntent.ts`, `…/classifyIntent.test.ts`
- **AC:** spec.md — *"A model failure inside `classify_intent` emits `fallback_triggered`"*
- **Commit:** `feat(courseAI): make the classifier's silent fallback an event`

- [x] Write the failing test · [x] Run it, see it FAIL (nothing is emitted)
- [x] Implement · [x] Run it, see it PASS · [x] `pnpm typecheck` + `pnpm check` clean · [x] Commit

---

## Task 5 — Measure, twice, on the unchanged set

- **Contract:** `pnpm eval courseAI:classifyIntent` reaches **≥ 85%**, with rows 03, 13 and 14
  resolving to `basic` and row 02 staying `continue`. The eval and its dataset are untouched, so the
  before-figure (80.0%, 16/20, failures `02, 03, 13, 14`) and the after-figure measure the same
  question.
- **Test:** the eval itself, run **before** the change is believed and **twice** after — one draw of
  20 rows is not a result, and this is the same discipline the confidence-node fix was held to. Both
  runs' figures go in the commit body, with the per-row outcome for the four rows above.
- **Files:** none — this task changes nothing and exists to produce a number.
- **AC:** spec.md — *"The node meets its own gate"*
- **Commit:** `test(evals): record what intent routing measures after the fix`

- [x] Run the eval, record the FAIL (80.0%, four rows) · [x] Run it after Tasks 1–4, see ≥ 85%
- [x] Run it a second time, confirm the direction holds · [x] Commit the figures

> **If a run still fails on 02 rather than on 03/13/14**, the resolver worked and the
> stored-versus-collected rule did not — those are different repairs, and the row-by-row outcome is
> what tells them apart. Do not average them into "still 85%".

---

## Task 6 — The spec says what was measured

- **Contract:** `spec.md` carries the after-figure beside the before one, `status` returns to
  `stable`, `_index.md` is regenerated. The recorded gap about `revise_prior_field` stays recorded —
  this change does not close it, and saying so is the point of having written it down.
- **Test:** `pnpm spec:sync` leaves no diff after committing; `pnpm test:unit` green.
- **Files:** `docs/specs/features/ai-course-builder/spec.md`, `docs/specs/features/_index.md`
- **AC:** Gate Docs (`documentation-process.md` §7)
- **Commit:** `docs(course-builder): record what intent routing measured`

- [x] Update spec.md · [x] `status: in-progress → stable` · [x] `pnpm spec:sync` · [x] Commit

---

## What the measurement changed during execution

Task 3 shipped twice. The first implementation scoped `ALREADY STORED` to the **current** step, and
the eval refused it in the most instructive way available: accuracy stayed at **80.0%** while the
failing rows changed completely, 02/03/13/14 → 07/15/16/19. The plan's four target rows were fixed
and four others broke, and only the row list said so — the number alone would have read as "no
effect".

The reading at the time was that the evidence had been scoped too narrowly: `revise` is mostly a
request about a step the instructor has already **left**, so a line reporting that the current step
holds nothing reads as "nothing is stored anywhere". Widening it to every step, attributed, recovered
row 07 and reached 85.0%. Stating the placement rule only in the cross-step direction then cost row
11 — the requirements step's own content pulled into `revise` — and completing the rule symmetrically
fixed it.

**That reading is not what the measurement can support, and the correction matters more than the
number.** Every row of this golden set passes `content: {}` (`classifyIntent.eval.ts:41`; the dataset
has no `content` field at all), so `storedByStep` is the empty string on all twenty rows and the
prompt always reads `ALREADY STORED: nothing stored yet`. **The per-step listing is inert under the
eval.** Between the two variants the measurement therefore saw only (a) the header losing the words
"IN THIS STEP" — which is itself a claim about scope, so not nothing — and (b) the Decide bullets,
rewritten in the same commit. Two levers moved together, which is the exact thing this feature's spec
forbids two sections earlier, and the honest statement is that the 80 → 85 delta cannot be attributed
between them.

Two consequences worth carrying forward rather than burying:

- **The 85.0% measures the empty-content prompt only.** In production `state.content` is populated, so
  real turns see a prompt shape that no golden row covers. Rows with populated `content` are the
  first thing this set needs — ahead of simply growing it.
- **The per-step attribution is a design argument, not a measured one.** It stays because scoping
  evidence to the current step is wrong on its face for a classifier whose main job is reaching
  backwards — but "wrong on its face" is where it rests, and the comment in the node now says so.

| | Accuracy | Failing rows |
|---|---|---|
| before | 80.0% (16/20) | 02, 03, 13, 14 |
| stored keys, current step only | 80.0% (16/20) | 07, 15, 16, 19 |
| stored keys, all steps | 85.0% (17/20) | 15, 16, 19 |
| cross-step rule only | 85–90%, unstable | 11, 15, (19) |
| **shipped** (rule in both directions) | **85.0% (17/20)** | **15, 16, 19** — two runs, identical |

One class remains: an addition aimed at an earlier step, phrased tentatively, while a later one is
being collected. At n=20 one row is five points, so the set's resolution is now the binding
constraint — which is a reason to grow the set, not to keep tuning wording against twenty rows.

## What review and audit added, and what they left open

Both passes converged on the same two findings, and one of them was the plan's own claim.

**Fixed on this branch:**

- **`field in shape` walked the prototype chain**, so `"constructor"`, `"toString"`, `"__proto__"`
  and five siblings all resolved to `basic` — the first step tested. The field name comes from the
  model, and an instructor writing a JavaScript course says "constructor" meaning nothing by it, so
  this was reachable by accident before it was reachable by intent, and it failed toward a confident
  `revise` on the ungated path rather than toward a `clarify`. Fixed twice over: `Object.hasOwn` in
  the resolver, and `reviseField` closed to a `z.enum` of the schemas' own keys so the case is
  unrepresentable at the boundary rather than caught after it. The enum also hands the model the key
  vocabulary the prompt never gave it, which was a false-positive source in the other direction.
- **`title` was schema-unique but language-ambiguous.** "Rename section 2" invited `reviseField:
  "title"` → `basic`, handing `revise_prior_field` a section request while asking it to regenerate the
  course's own attributes. A prompt clause now says section and lesson titles are part of `sections`.
- **`keys.join(", ")` was outside the wrapping scan**, under its documented false negative 4. Entered
  in `ALLOWED_INTERPOLATIONS` with its claim, and the false-negative note corrected from one such
  shape to two — a blind spot nobody lists reads as coverage.
- **The node's JSDoc and `graph-contract.md` row 12** no longer matched what the node reads or how it
  fails. Both updated.
- **Test hygiene:** the stub now applies the real schema (renaming `reviseField` in one place and not
  the other would otherwise leave every test green), `beforeEach` clears, `promptOf` reads the last
  call rather than the first.

**Left open, deliberately, each with its owner named:**

- **The golden set pins `content: {}`,** so the `ALREADY STORED` input is inert under measurement and
  production sees a prompt shape no row covers. Populating `content` per row plus a contract test that
  every `revise` row carries a stored key of its expected target is the next change on this set —
  ahead of growing it. Not done here because editing the set mid-fix destroys the before/after
  comparison this branch rests on.
- **`graphContract.contract.test.ts` checks that the four JSDoc labels exist, not that they are
  accurate.** Collecting `state.<x>` reads from each node body via the TS AST and asserting they
  appear in `Reads:` would make this class of drift mechanical instead of reviewable. Worth its own
  change; it touches every node.
- **`reason` is discarded.** The plan promised the clarify question would ride in it; carrying it
  needs a new state field and a graph-contract change. `chat_response` composes its own question via
  `clarifyIntentPrompt`, so nothing is lost — recorded because an unstated deviation is how a plan
  stops being the record.

## Why the plan is thin

A plan carrying full implementation code only pays for itself when a *cheaper* model executes it.
Here the executor is the same model that wrote the plan, so the feature gets generated twice — once
as code inside markdown, once as code — and the two drift. Contracts and test names are enough to
execute from, and the compiler and the tests catch what prose cannot. — ADR-030.

**No `code-explorer` or `code-architect` dispatch.** The surface is four files, all read in full
while writing the spec, and the anchors above carry real line numbers. A reconnaissance agent would
re-read them cold to reach the same place — the case `docs/constitution.md` §Agent economics names
("executing a task whose context the caller already holds pays for that context twice").

## Self-review (run before handoff)

| Acceptance criterion | Task |
|---|---|
| The node meets its own gate (≥ 85%) | 5, achieved by 1–3 |
| The model names the field; the step is derived | 1 (resolver), 2 (node) |
| The three measured failures pass by construction | 1 + 2, measured in 5 |
| An unresolvable field is a `clarify`, never a null target | 2 |
| Supplying content for a step storing nothing is `continue` | 3, measured in 5 (row 02) |
| A model failure emits `fallback_triggered` | 4 |
| The field→step map is derived, never hand-maintained | 1 (case **a** asserts it from the schemas) |
| The `title` collision is in the language, not the schema | 1 (case **b** asserts uniqueness) |
| Gate Docs | 6 |

**Guarded coverage** — the classifier named no authority and no control, so there is no control task;
the reason is in **Track** rather than left implicit. Task 4 adds an observability event, which is
additive: its test asserts fail-open is preserved, because an alert path that can break the path it
watches is the failure `emit.ts` and `securityLog.ts` both refuse by design.

**Contract clarity** — each task states an observable outcome. Task 3's outcome is an *input*, and
the task says so rather than pretending a stubbed model proves behaviour.

**Type consistency** — `stepForField(field: string): DraftStep | null` is introduced in Task 1 and
used unchanged in Task 2. `reviseField` is the new schema key; `reviseTarget` remains the state field
and keeps its type, which is why the eval needs no change.

## Final verification

- `pnpm typecheck`, `pnpm check`, `pnpm test:unit`, `pnpm test:integration` — green.
- `pnpm eval courseAI:classifyIntent` — ≥ 85%, twice, both figures in the commit body.
- `pnpm eval courseAI:confidenceScore` and `courseAI:extractStepData` — unchanged, confirming the
  prompt rewrite did not disturb the neighbouring nodes through shared state.
- **Break Task 1's uniqueness case on purpose**: add a duplicate top-level key to two schemas in a
  scratch edit, see the test go red, revert. A property test that cannot fail proves nothing.
- **Confirm the dead end is unreachable**: grep that no path can now reach
  `revise_prior_field`'s `!state.reviseTarget` branch from `classify_intent` — it stays in the code
  for the `finalize` entry and for defence, and that is deliberate.
