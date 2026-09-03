# AI Observability (aiMetrics) Implementation Plan

> **For agentic workers:** execute with `superpowers:executing-plans` in this session — the warm
> context is the cheapest place to run TDD loops (ADR-030). Dispatch a subagent only for work that
> *reads a lot and returns little*; reconnaissance goes to `Explore`, never `general-purpose`.
> Steps use checkbox (`- [ ]`) syntax. See [`../spec.md`](../spec.md) for the design and Acceptance
> criteria, and [`../security.md`](../security.md) for the control this plan must not move.

**Goal:** Every chat-model call on the five AI surfaces and the L2 guard emits one structured log
line carrying latency, tokens, approximate cost and an outcome, plus one summary line per turn — with
one price table shared by `server/` and `evals/`.

**Architecture:** A single `BaseCallbackHandler` is attached once in the `RunnableConfig` at each run
root. Because `withNodeErrors` forwards `config` to every courseAI node and `confidenceScore` passes
it into `model.invoke`, the handler reaches every node without any node changing — so no call-site
wrappers exist to drift. The handler defines `handleChatModelStart` (never `handleLLMStart`), which
is what stops LangChain building the rendered-prompt string at all. `checkTopicRelevance` is attached
separately because it runs outside both graphs.

**Track:** `pnpm classify` on the current tree reports **STANDARD-OR-DIRECT** — only docs exist so far.
The verdict on the finished diff is **GUARDED (control change)**: Task 11 puts
`server/services/_shared/aiGuard/topicRelevance.ts` in the diff, which is the `ai-guard` control
signal (predicate run directly during `/spec`: returns `true`). Per `documentation-process.md` §3a
that is **complex tier**. No new authority — no route, procedure, tool, model, migration or env var —
so per §3d **no design pass ran**; `llm-security-auditor` runs in `audit` mode at `/qa`. The one
control is L2, and it gets **its own task with a both-direction test** (Task 11).

**Codebase anchors (verified during planning, each read this session):**
- `PRICES` / `usageCost` / `usageOfMessage` / `TokenUsage` (`evals/_shared/cost.ts:28-31,33,43,86`) — the
  table and reader being moved; `usageCost` returns `null` for an unpriced model, and that semantic
  is load-bearing.
- `recordUsage` consumers (`evals/lessonAI/tutor.eval.ts:360`, `evals/_shared/judge.ts:137`) — the two
  imports Task 1 must keep green.
- `isNodeAbort` / `isRetryable` / `classifyNodeError` (`server/services/courseAI/graph/nodeErrors.ts:37,72,87`)
  — the shape rules to lift, protected by `nodeErrors.test.ts`.
- `logSecurityEvent` (`server/services/_shared/aiGuard/securityLog.ts:45`) — the single-writer shape to
  copy: object-first `logger.warn({fields}, "msg")`, field set exhaustive by type, forward wrapped in
  try/catch so a failing sink cannot fail the caller's turn.
- `logger` reporter (`server/utils/logger.ts:43-52`) — **only `error`-level entries reach Sentry**. This
  is why metrics are `info`.
- `withNodeErrors` (`server/services/courseAI/graph/withNodeErrors.ts:11-14`) — forwards `config` to
  every node; already logs `{feature, node, kind, errorName}` at `debug`.
- Attachment sites, all verified: `courseAI.service.ts:139` and `:172`; `lessonAI.service.ts:158`;
  `learningPathAI.service.ts:97` and `:132`; `quizAI.service.ts:140`; `lessonInsightsAI.service.ts:94`;
  `topicRelevance.ts:52-58`.
- `lessonAI.service.ts:280-289` — the `finally` block. It is the **only** construct that survives the
  consumer abandoning the generator, which is why the turn summary belongs there and nowhere else.
- `L2_TIMEOUT_MS = 3_000`, `maxRetries: 1` (`server/services/_shared/aiGuard/topicRelevance.ts:41,59-60`)
  — must be byte-identical after Task 11.
- `handleChatModelStart(llm, messages, runId, parentRunId, extraParams, tags, metadata, runName)`
  (`@langchain/core/dist/callbacks/base.d.ts:81`) — `metadata` carries `langgraph_node`. The manager
  (`callbacks/manager.js:315-319`) calls this hook when present and **only otherwise** falls back to
  `handleLLMStart`, where `getBufferString` renders every message into a string. Defining the chat
  hook is a security control, not a style choice.
- `BaseCallbackHandler` requires `abstract name: string` (`base.d.ts:203`).
- Source-scan contract-test idiom: `walk()` + `code()` (strips comments before matching)
  (`server/services/_shared/aiLimits/aiLimits.contract.test.ts:8-13,63-66`).
- Scalar-only payload assertion idiom (`server/observability/aiLogShape.contract.test.ts:88-93`).
- `vitest.config.ts:19-21` — `unit` project is `**/*.test.ts`; contract tests are ordinary unit tests.

**Per-task conventions:** after the implement step, `pnpm typecheck` and `pnpm check` must be clean
before committing. Unit tests colocated `*.test.ts`; contract tests `*.contract.test.ts`. No task may
introduce `logger.error` inside `aiMetrics/**`, and no task adds an env var or a Prisma model.

---

## Task 1 — One price table, in `server/`, read by `evals/`

- **Contract:** `PRICES`, `TokenUsage`, `usageOfMessage()`, `usageCost()` and `totalUsage()` live in
  `server/services/_shared/aiMetrics/pricing.ts`. `evals/_shared/cost.ts` keeps its run-aggregation
  (`recordUsage`, `takeRecordedUsage`, `formatRunCost`) and imports the priced primitives from there.
  `usageCost()` still returns `null` — never `0` — for a model absent from the table.
- **Test:** `server/services/_shared/aiMetrics/pricing.test.ts` — a priced model yields the expected
  figure; an unpriced model yields `null` (not `0`); `usageOfMessage` returns zeros for a message with
  no `usage_metadata` rather than throwing. Existing `evals/_shared/cost.test.ts` must stay green
  unchanged: it is the regression proof that the move changed no behaviour.
- **Files:** create `server/services/_shared/aiMetrics/pricing.ts`; modify `evals/_shared/cost.ts`.
  `evals/lessonAI/tutor.eval.ts` and `evals/_shared/judge.ts` should need **no** edit — if they do, the
  re-export surface is wrong.
- **AC:** spec.md #1, #2
- **Commit:** `refactor(aiMetrics): move the price table to server, one table for both readers`

- [ ] Write the failing test · [ ] Run it, see it FAIL (module does not exist) · [ ] Implement
- [ ] Run it + `evals/_shared/cost.test.ts`, see both PASS · [ ] `pnpm typecheck` + `pnpm check` clean
- [ ] Commit

---

## Task 2 — A second price table cannot come back

- **Contract:** A contract test fails if any file outside `pricing.ts` declares a per-model price
  literal.
- **Test:** `server/services/_shared/aiMetrics/pricing.contract.test.ts` — scans `server/`, `evals/`,
  `lib/`, `scripts/` (comments stripped, per the `code()` idiom) for a second table.
- **Files:** create `server/services/_shared/aiMetrics/pricing.contract.test.ts`
- **AC:** spec.md #1
- **Commit:** `test(aiMetrics): pin the price table to one home`

- [ ] Write the test · [ ] **Break it on purpose**: paste a decoy price literal into another file, run,
  see it go RED (a contract test that never fails proves nothing) · [ ] Remove the decoy
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 3 — The error-shape rules are shared, not copied

- **Contract:** The pure shape predicates (`isRetryable`, `isNodeAbort`) move to
  `server/services/_shared/aiErrors/errorShape.ts`. `courseAI/graph/nodeErrors.ts` imports them and
  keeps `classifyNodeError`, which wraps them in the courseAI error classes. Behaviour is unchanged.
  A `_shared` module must not import from a feature service, which is why this lift exists rather than
  `aiMetrics` reaching into `courseAI`.
- **Test:** existing `server/services/courseAI/graph/nodeErrors.test.ts` and `withNodeErrors.test.ts`
  pass unchanged — that is the whole assertion. Add no new cases here.
- **Files:** create `server/services/_shared/aiErrors/errorShape.ts`; modify
  `server/services/courseAI/graph/nodeErrors.ts`
- **AC:** enabler for spec.md #4 and #8 (the outcome taxonomy reuses these rules rather than
  re-deriving them)
- **Commit:** `refactor(aiErrors): lift the provider-error shape rules into _shared`

- [ ] Run the existing tests, see them PASS (the baseline) · [ ] Move the predicates
- [ ] Run them again, see them still PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 4 — The event admits no free text, and the writer cannot break a turn

- **Contract:** `types.ts` declares `AiMetricOutcome` (`ok` | `retryable_error` | `fatal_error` |
  `aborted`) and the call/turn event types — whose fields are exactly those in spec.md §Outputs, with
  **no field whose type admits a prompt, reply, or error message**. `emit.ts` is the single writer:
  object-first `logger.info({fields}, "[aiMetrics] call" | "[aiMetrics] turn")`, wrapped in try/catch so
  a throwing sink is swallowed. `guard_blocked` is deliberately not a member of `AiMetricOutcome`.
- **Test:** `server/services/_shared/aiMetrics/emit.test.ts` — every value in the emitted payload is a
  primitive scalar; with the logger stubbed to throw, `emitCall`/`emitTurn` return normally rather than
  propagating; the emitted level is `info` and never `error`.
- **Files:** create `server/services/_shared/aiMetrics/types.ts`, `emit.ts`
- **AC:** spec.md #4, #6, #9, #10
- **Commit:** `feat(aiMetrics): the single writer, with a field set closed by type`

- [ ] Write the failing test · [ ] Run it, see it FAIL · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 5 — The two structural rules are pinned by contract tests

- **Contract:** Two contract tests: the emitted payload is scalar-only (so a future field carrying text
  fails CI), and no file under `aiMetrics/**` calls `logger.error` (so no metric can reach Sentry or
  consume its 5 000-event quota).
- **Test:** `server/services/_shared/aiMetrics/aiMetrics.contract.test.ts` — the scalar scan over a
  driven emit (the `aiLogShape.contract.test.ts:88-93` idiom), and a source scan over the module
  directory for `logger.error`.
- **Files:** create `server/services/_shared/aiMetrics/aiMetrics.contract.test.ts`
- **AC:** spec.md #6, #10
- **Commit:** `test(aiMetrics): pin scalar-only payloads and the no-error-level rule`

- [ ] Write the tests · [ ] **Break each on purpose** (add a text field; add a `logger.error`), see each
  go RED · [ ] Revert both decoys · [ ] Run, see PASS · [ ] `pnpm typecheck` + `pnpm check` clean
- [ ] Commit

---

## Task 6 — The handler measures one call

- **Contract:** `handler.ts` exports `aiMetricsHandler(ctx)` returning a `BaseCallbackHandler` that
  implements **`handleChatModelStart`** (recording `runId` → start time, model, and `node` from
  `metadata.langgraph_node`), `handleLLMEnd` (latency, `usage_metadata`, cost, `outcome: "ok"`) and
  `handleLLMError` (outcome from the lifted shape rules, `errorName` only). It **must not** implement
  `handleLLMStart` — doing so makes LangChain render every message into a string via `getBufferString`.
  An aborted error emits no call line.
- **Test:** `server/services/_shared/aiMetrics/handler.test.ts` — a start/end pair emits one line with
  non-zero `promptTokens` read from the end message's `usage_metadata` (AC 12) and the node name from
  metadata; an error whose `message` holds a marker emits `errorName` only and the marker appears
  **nowhere** in the payload (AC 7); a retryable shape and a fatal shape map to their outcomes; an abort
  emits nothing. Assert the handler object has no `handleLLMStart` property.
- **Files:** create `server/services/_shared/aiMetrics/handler.ts`, `handler.test.ts`; modify
  `server/services/_shared/aiMetrics/index.ts`
- **AC:** spec.md #4, #7, #12
- **Commit:** `feat(aiMetrics): a callback handler that meters one model call`

- [ ] Write the failing test · [ ] Run it, see it FAIL · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 7 — The turn summary, including the turn nobody finished

- **Contract:** The handler accumulates per-turn state and exposes a `summary()` the caller emits on
  every exit: `calls`, summed tokens, `costUsd`, `wallMs`, `ttftMs`, `outcome`. A turn containing an
  unpriced call reports `costUsd: null`, not a partial number. `ttftMs` is present for a streaming run
  and **absent** (not `0`) otherwise. A turn with zero model calls still emits a summary. An aborted
  turn emits a summary with `outcome: "aborted"` and no error line.
- **Test:** `server/services/_shared/aiMetrics/handler.test.ts` (extended) — totals across three calls;
  one unpriced call makes the whole total `null`; `calls: 0` still emits; `ttftMs` absent on a
  non-streaming run; abort yields `outcome: "aborted"`.
- **Files:** modify `server/services/_shared/aiMetrics/handler.ts`, `types.ts`, `handler.test.ts`
- **AC:** spec.md #2, #5, #8, #13
- **Commit:** `feat(aiMetrics): per-turn rollup, including aborted and unpriced turns`

- [ ] Write the failing test · [ ] Run it, see it FAIL · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 8 — courseAI is metered, node by node

- **Contract:** `runChat` and `runFinalize` attach the handler in the config they already pass to
  `streamEvents`, and emit the turn summary when the run ends. No graph node file is modified — that is
  the design being proved. Each node that calls a model produces its own line carrying that node's name.
- **Test:** `server/services/courseAI/courseAI.service.test.ts` — with `streamEvents` spied, the config
  carries a `callbacks` array; driving the handler with two nodes' worth of start/end events yields two
  lines whose `node` values differ (AC 14). Assert `git diff` touches no file under `graph/nodes/`.
- **Files:** modify `server/services/courseAI/courseAI.service.ts`
- **AC:** spec.md #3, #14
- **Commit:** `feat(courseAI): meter every node through one root-level handler`

- [ ] Write the failing test · [ ] Run it, see it FAIL · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 9 — lessonAI is metered, and the meter survives every exit

- **Contract:** The tutor attaches the handler at `:158` and emits its turn summary from the **`finally`
  block at `:280`** — the only construct that survives a consumer abandoning the generator, which is
  why `finishWithoutDelivery` already lives there. A throwing logger does not fail the turn.
- **Test:** `server/services/lessonAI/lessonAI.service.test.ts` (or the existing suite) — a normal turn
  emits exactly one summary; an aborted turn emits a summary with `outcome: "aborted"` and **no** error
  line (AC 8); a consumer that breaks its `for await` mid-stream still produces a summary; with the
  logger stubbed to throw on every call, the turn still completes and still returns its content (AC 9).
- **Files:** modify `server/services/lessonAI/lessonAI.service.ts`
- **AC:** spec.md #3, #5, #8, #9
- **Commit:** `feat(lessonAI): meter the tutor turn on every exit path`

- [ ] Write the failing test · [ ] Run it, see it FAIL · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 10 — The three remaining surfaces are metered

- **Contract:** `quizAI` (`:140`) and `lessonInsightsAI` (`:94`) gain a config argument on their
  `invoke` calls carrying the handler; `learningPathAI` adds it to the config it already passes at both
  `:97` and `:132`. Each emits a turn summary. quizAI's three generation attempts appear as three call
  lines inside **one** turn summary.
- **Test:** the three services' colocated tests — the config passed to `invoke`/`streamEvents` carries
  `callbacks`; a driven three-attempt quizAI run yields `calls: 3` in one summary.
- **Files:** modify `server/services/quizAI/quizAI.service.ts`,
  `server/services/lessonInsightsAI/lessonInsightsAI.service.ts`,
  `server/services/learningPathAI/learningPathAI.service.ts`
- **AC:** spec.md #3
- **Commit:** `feat(aiMetrics): meter quizAI, lessonInsightsAI and learningPathAI`

- [ ] Write the failing test · [ ] Run it, see it FAIL · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 11 — The L2 guard is metered, and provably unchanged **[the guarded control]**

- **Contract:** `checkTopicRelevance` passes the handler in the config to its `model.invoke`, and
  nothing else about it moves: same verdict, same `timeout: 3_000`, same `maxRetries: 1`, same
  fail-open. This is the single control `pnpm classify` names, and §3d requires it be proven in **both**
  directions rather than on recall alone.
- **Test:** `server/services/_shared/aiGuard/topicRelevance.test.ts` and
  `guardUserInput.test.ts` — extend, do not replace:
  - **recall:** an off-topic message is still blocked;
  - **false positive:** an **on-topic** message is still allowed — the half that catches a meter which
    slowed L2 into its own timeout and silently converted allowed turns into fail-open ones;
  - **fail-open:** an L2 timeout still yields `fallback_triggered` with `ruleIds: ["l2_unavailable"]`;
  - **bounds:** the constructor still receives `{timeout: 3_000, maxRetries: 1}`
    (`topicRelevance.test.ts:95` already asserts this — it must stay green untouched);
  - **cost:** the L2 call emits a metric line, so a tutor turn now shows two calls, not one.
- **Files:** modify `server/services/_shared/aiGuard/topicRelevance.ts`
- **AC:** spec.md #11; security.md §S3
- **Commit:** `feat(aiGuard): meter the L2 relevance call without moving the control`

- [ ] Write the failing test · [ ] Run it, see it FAIL · [ ] Implement
- [ ] Run it **and the full `aiGuard` suite**, see all PASS · [ ] `pnpm typecheck` + `pnpm check` clean
- [ ] Commit

---

## Task 12 — An attachment point cannot be silently dropped

- **Contract:** A contract test scans every run root named in this plan and fails if one stops passing
  the handler — the drift class that a per-call-site design would have needed a test for on *every*
  call site, and that this design needs it for only at the roots.
- **Test:** `server/services/_shared/aiMetrics/attachment.contract.test.ts` — source scan (the
  `aiLimits.contract.test.ts` `walk`/`code` idiom) asserting each of the eight sites passes a handler.
- **Files:** create `server/services/_shared/aiMetrics/attachment.contract.test.ts`
- **AC:** spec.md #3
- **Commit:** `test(aiMetrics): pin every attachment point`

- [ ] Write the test · [ ] **Break it on purpose**: remove the handler from one root, see it go RED
- [ ] Restore · [ ] Run, see PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Why the plan is thin

A plan carrying full implementation code only pays for itself when a *cheaper* model executes it.
Here the executor is the same model that wrote the plan, so the feature gets generated twice — once
as code inside markdown, once as code — and the two drift. Contracts and test names are enough to
execute from, and the compiler and the tests catch what prose cannot. — ADR-030.

**The exception, and it is narrow:** include code when the exact form of the code *is* the thing
being approved. **No task here qualifies.** Task 11 is the closest call — it touches a guard — but what
is being approved there is that the control's *observable behaviour is unchanged*, which is expressed
by the four-way test, not by a code block.

## Self-review (run before handoff)

**Spec coverage — every acceptance criterion maps to a task:**

| AC | What it requires | Task |
|---|---|---|
| 1 | One price table, no second literal | T1, T2 |
| 2 | `null` not `0` for unpriced; unknown turn total | T1, T7 |
| 3 | Handler on all five surfaces + L2; scan pins it | T8, T9, T10, T11, T12 |
| 4 | Per-call line carries exactly the listed fields | T4, T6 |
| 5 | One turn summary per turn, on every exit | T7, T9 |
| 6 | No free text emittable; scalar-only contract test | T4, T5 |
| 7 | Error line carries `err.name` only; marker absent | T6 |
| 8 | Abort: no error line, summary `"aborted"` | T7, T9 |
| 9 | A throwing logger cannot fail a turn | T4, T9 |
| 10 | No `logger.error` in the module | T4, T5 |
| 11 | L2 verdict/timeout/retries/fail-open unchanged | **T11** |
| 12 | Streaming reports non-zero `promptTokens` | T6 |
| 13 | `ttftMs` present streaming, absent otherwise | T7 |
| 14 | One line per node, carrying the node name | T8 |

No gaps.

**Guarded coverage:** the classifier names exactly one control — `ai-guard`, via `topicRelevance.ts`.
It has its own task (T11) with its own test, proven in both directions plus fail-open plus unchanged
bounds. No other authority or control is touched: no route, procedure, tool, Prisma model, migration,
or env var appears anywhere in this plan.

**Contract clarity:** every task states an observable outcome. T3 is the one refactor, and its
assertion is explicitly "the existing tests stay green".

**Type consistency:** `AiMetricOutcome` (T4) is the only outcome type and is used unchanged in T6, T7
and T9. `aiMetricsHandler(ctx)` (T6) is the only constructor, used in T8–T11. `usageCost`/
`usageOfMessage` (T1) keep the names `evals/` already imports.

**Ordering:** T1 briefly touches `evals/` imports and must land green before anything else. T3 must
precede T6 (the handler consumes the lifted rules). T12 must land last — it asserts the attachments
made in T8–T11.

## Final verification

- `pnpm typecheck`, `pnpm check`, `pnpm test:unit`, `pnpm test:integration` — all green.
- `pnpm classify` — confirm the verdict is **GUARDED (control change)** naming `topicRelevance.ts`, and
  that it names **no** authority signal. An authority line here means the plan grew a surface it was
  not approved for.
- Break each of the four new contract tests on purpose (second price table; a text field in the event;
  a `logger.error` in the module; a dropped attachment) and see each go red. A test that never fails
  proves nothing.
- Run one real courseAI turn and one real tutor turn against the dev server; confirm the per-call lines
  name distinct nodes, that the tutor shows **two** calls (agent + L2), and that the turn summary's
  cost is a number rather than `null`.
- Abort a tutor turn mid-stream from the browser; confirm exactly one summary with `outcome:
  "aborted"` and no error line.
- Confirm `git diff --stat` touches **no** file under `server/services/courseAI/graph/nodes/` — if it
  does, the root-level design was abandoned somewhere and the plan should be re-approved.
