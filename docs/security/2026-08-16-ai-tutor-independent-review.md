# Independent review — AI lesson tutor

**Date:** 2026-08-16 · **Scope:** `POST /api/chat/lesson` and everything it reaches ·
**Method:** code reading, no execution, no evals run

This is a **second opinion**, not a re-statement of
[`features/ai-tutor-guardrails/security.md`](../specs/features/ai-tutor-guardrails/security.md).
That document is unusually honest — its §S13 register already carries 29 accepted risks and open
gaps — so re-reporting them would be noise. Everything below is either **new**, or a place where the
**document and the code disagree**.

Companion: [`2026-08-16-ai-content-supply-chain.md`](./2026-08-16-ai-content-supply-chain.md), which
covers the same tutor from the other side — as a *consumer* of instructor-authored content.

---

## Verdict

The tutor's boundaries are placed correctly, and correctly ranked: authority (`toolPolicy`) and
output (`validateReply` + `inAppUrlTransform`) do the real work, the input guard is a filter and is
described as one. The design does not confuse a prompt instruction with a control. That is rarer
than it should be, and the measured `aiGuard:indirect` numbers (wrapper flips 1 of 12 payloads) are
the reason it isn't confused here.

The weaknesses I found are not in the boundaries. They are in the **paths that skip them**: a hang
instead of an error, an abort instead of a completion, a rejected reply whose prompt stays eligible.
Four of the seven findings below share one shape — *the control runs on the happy path and the
adversary picks a different one*.

Nothing here is Critical. F1 and F2 are worth fixing this week.

---

## Findings

Ordered by what I'd fix first. Severity reflects exploitability and blast radius, not how the words
sound.

### F1 — Aborting the stream discards the reply *and* the security event

**Severity: High (detection evasion)** · `lessonAI.service.ts:104-105,142` · `route.ts:165-168`

`streamResponse` checks `if (signal?.aborted) return;` inside the event loop, and the route breaks
out of its `for await` on the same condition. Both return **before** `validateReply` runs — which
means before `output_validation_failed` is emitted and before the retraction event is sent.

The tokens have already reached the browser by then. So a student who closes the SSE connection
after the last content token, but before completion, receives the full reply and leaves **no trace
at all**: no validation, no security event, no retraction, and no persisted assistant row to audit
later.

This matters more than the raw disclosure, because S13 §2 accepts the streaming disclosure
*specifically on the strength of the compensating control*, and S11 states that
"`output_validation_failed` frequency is the compensating control for the streaming disclosure."
An attacker chooses whether that control runs. The accepted risk was priced against a control that
an adversary can switch off.

**Fix.** Validate on abort as well as on completion. The reply text is already accumulated in
`fullReply`; retraction is moot (the client is gone) but the *event* is the point:

```ts
// in the abort early-return path, before returning
if (fullReply) {
  try {
    const v = validateReply(fullReply, { userId: studentId, retrievedContent });
    if (!v.valid) { /* validateReply already emitted the event */ }
  } catch { /* logSecurityEvent(validator_error) as in the normal path */ }
}
return;
```

Persisting still must not happen on abort — that part is correct today. Add a
`lessonAI.service.test.ts` case: aborted turn with an invalid reply still emits
`output_validation_failed`.

---

### F2 — L2 has no timeout, so the fail-open path never fires on the failure that matters

**Severity: High (availability + a defeated fallback)** · `topicRelevance.ts:44-48`

```ts
const model = new ChatOpenAI({
  model: "gpt-4o-mini",
  temperature: 0,
  apiKey: env.OPENAI_API_KEY,
}).withStructuredOutput(GuardOutputSchema);
```

No `timeout`, no `maxRetries`, and no `signal`. The OpenAI SDK default is minutes, with retries on
top. This call sits in the request path of **every tutor turn**, before a single token streams.

`guardUserInput` is designed to fail open (`guardUserInput.ts:83-96`) precisely so a provider
incident does not block students. But that `catch` only catches *errors*. A provider that is slow
rather than down produces neither an error nor a `fallback_triggered` event — the student simply
waits, and the incident is invisible to the exact signal built to make it visible.

Fail-open handles the failure mode that announces itself, and not the one that doesn't. Degradations
are more common than outages.

**Fix.** Give the call a budget and route the timeout into the same fallback:

```ts
new ChatOpenAI({ /* … */, timeout: 3_000, maxRetries: 1 })
```

An `AbortSignal.timeout(3_000)` passed through `invoke` works equally well and composes with the
request's own signal. Either way the timeout surfaces as a throw, which `guardUserInput` already
turns into `fallback_triggered` + allow. Add a `guardUserInput.test.ts` case for it — the existing
tests cover the error path, not the slow path.

Related, and cheap to do at the same time: no model call in the tutor path declares a timeout.
`grep -n "new ChatOpenAI" -A6 server/services/` finds them all.

---

### F3 — A rejected reply retracts the answer but leaves the prompt context-eligible

**Severity: Medium** · `route.ts:131-134` + `lessonAI.service.ts:169-189`

The user's turn is persisted with the default `contextEligible: true` *before* the stream starts.
When `validateReply` then rejects the assembled reply, the assistant text is retracted and never
persisted — but the user message that elicited it stays eligible and is replayed as trusted
`HumanMessage` history on the next turn.

The design reasoning behind `contextEligible` (S6: "rejected turns never become context") is applied
to turns the *input* guard rejected, and not to turns the *output* boundary rejected. Yet an output
rejection is the stronger adversarial signal of the two — S13 §24 says as much when it justifies the
`mastery_write_retained` event.

Practical consequence: a payload that trips output validation can simply be re-sent, and each retry
is a fresh sample from a stochastic model with the previous attempt sitting in context as normal
conversation. The prompt gets retries; the defence gets one sample per retry.

**Fix.** Have `saveMessage` return the row (it already does) and flip that row on rejection:

```ts
const userRow = await lessonAssistantRepository.saveMessage(/* … */);
// …
if (!validation.valid) {
  await lessonAssistantRepository.markContextIneligible(userRow.id);
  // existing retract path
}
```

This needs the message id threaded from the route into `streamResponse` (or the save moved into the
service). Prefer the latter — it also removes the current split where the route persists the user
turn and the service persists the assistant turn.

---

### F4 — `mastery_write_retained` detection compares prose

**Severity: Medium (silent loss of a zero-baseline signal)** · `lessonAI.service.ts:131-138`

```ts
if (event.name === "mark_concept_understood" && text !== "" && text !== NEUTRAL_REFUSAL_MESSAGE) {
  masteryCommitted = true;
}
```

Whether an educational record was written is inferred by string-comparing the tool's output against
a user-facing sentence. Two ways this breaks quietly:

- `NEUTRAL_REFUSAL_MESSAGE` is deliberately shared by three refusal paths (S9). Any future rewording
  is a product change — nobody will think of it as touching telemetry, and nothing fails.
- If `toolPolicy` ever gains a second denial message, denials start counting as commits.

Both directions are wrong in a way no test catches, and the signal has a **baseline of zero** — a
silent failure here is a permanent blind spot, not a degraded metric.

**Fix.** Return a structured result from the write tool and branch on it rather than on prose:

```ts
// markConceptUnderstood.tool.ts
if (!authorization.authorized) return JSON.stringify({ ok: false });
// …
return JSON.stringify({ ok: true, concept: authorization.canonicalConcept, level });
```

If the model needs a human-readable string, keep the prose *and* a machine-readable prefix, and
assert both in `markConceptUnderstood.tool.test.ts`.

---

### F5 — The history window bounds messages, not size

**Severity: Medium (cost + the prompt-dilution it was meant to prevent)** ·
`lessonAssistant.repository.ts:9`

`MODEL_CONTEXT_MESSAGE_LIMIT = 20`, and `validateMessageLength` caps a single message at 2,000
characters. Twenty replayed turns of student-controlled text is therefore up to ~40 KB per turn,
before the system prompt, the retrieved chunks, and the tool results.

The repository comment states the limit exists to bound cost *and* "keep the system prompt from
being diluted as the conversation grows — a guard that lives in the prompt weakens as its share of
the context shrinks." A message count does not bound either quantity; a student writing 2,000-char
messages gets 20× the dilution of one writing 100-char messages, which is exactly backwards from
what the comment wants.

**Fix.** Keep the count limit and add a character budget, walking newest-first and stopping when the
budget is exhausted:

```ts
const MODEL_CONTEXT_CHAR_BUDGET = 8_000;
```

Trim whole messages, never mid-message — a truncated turn is a new injection primitive.

---

### F6 — The shared rate limiter is one bucket for three features, and §17 cites the wrong file

**Severity: Medium (cost), Low (abuse)** · `server/utils/aiRateLimiter.ts`

Three facts that are individually fine and jointly not:

1. `checkAiRateLimit` is keyed on `userId` alone and is called by `/api/chat/lesson`,
   `/api/chat/course` and `/api/chat/learning-path`. One bucket of 20/min covers all three — using
   the tutor consumes the instructor's builder budget for the same account.
2. It is a per-process `Map`, so the real guarantee is 20/min **per instance** and the caller
   controls instance count through parallelism.
3. One tutor *request* is not one model call. The ReAct agent may call L2, then the router model,
   then several tools, then the answer model. There is no explicit `recursionLimit` on
   `createLessonAgent`, so the bound is LangGraph's default (25) rather than a stated decision.

S13 §17 documents the per-process property but cites `learningPathAI.service.ts:8` and files it
"out of scope for this area". The tutor's own limiter is `server/utils/aiRateLimiter.ts`, and it is
squarely in scope.

**Fix.** Key by `${userId}:${feature}`; set an explicit `recursionLimit` on the tutor agent so the
per-request cost ceiling is a decision rather than a default; and correct §17.

---

### F7 — S9/S6 describe a persistence behaviour the code does not implement

**Severity: Low (documentation correctness — but this doc is the spec)** ·
`security.md` S6/S9 vs `route.ts:107-112`

S9's table says an L1 block persists "user turn, `contextEligible: false`", and S6 says "A turn the
guard rejected is stored with `contextEligible: false` … The UI still shows it."

The code persists **nothing** on a block, and says so deliberately:

```ts
if (guard.outcome === "blocked") {
  // Persist NOTHING. A stored injection payload is replayed as trusted
  // HumanMessage history on the next turn, where no L3 wrapping applies —
  // which would silently defeat this block.
  return oneShot({ type: "guard_blocked", message: guard.message });
}
```

The code is right and the document is stale — the off-topic branch below it *does* persist both rows
with `contextEligible: false`, which is what S6/S9 describe. Two different behaviours got collapsed
into one row.

This matters because `security.md` is explicitly written as requirements "so it can be followed
without reading the implementation". A reader implementing a sixth AI surface from S9 would persist
blocked payloads.

**Fix.** Split the S9 row into `L1 block → persisted: nothing` and `L2 off-topic → both rows,
contextEligible: false`, and amend S6's sentence to name the off-topic case.

---

## Checked and clean

Recording these so the next pass doesn't re-audit them.

- **Authorization binding** (`route.ts:40-78`) — the row that proves access supplies `courseId`,
  `lessonId` and both titles. No second lookup. Soft-deleted courses are excluded transitively
  because `courseRepository.deleteCourse` cascades `deletedAt` to lessons in one transaction.
- **Tool identifiers** — all four bound by closure in `createLessonAgent`; no id-shaped argument in
  any schema, pinned by `toolArguments.contract.test.ts`.
- **`toolPolicy` ordering** — empty allowlist denies first, ceiling second, allowlist membership
  third; canonical spelling stored, not the model's string.
- **`validateReply` fail-closed** — a throw is treated as a rejection at the call site
  (`lessonAI.service.ts:157-167`), not swallowed inside the validator.
- **Rendering** — `react-markdown` without `rehype-raw`, so HTML is escaped; `inAppUrlTransform`
  operates on the parsed AST and drops off-origin destinations. No XSS path found.
- **Off-topic refusal escaping** — `MARKDOWN_ACTIVE` covers `\ ` `` ` `` `[ ] ( ) < > !`, which is
  the full set needed to neutralise inline links, reference definitions and autolinks. It omits
  `* _ # ~ |`, which affect emphasis only. The `"\\$&"` replacement is correct here: the untrusted
  text is the *pattern target*, not the replacement, so `$&` is the intended meaning rather than the
  S6 hazard.
- **Conversation IDOR** — `lessonAssistantRouter.getHistory` / `clearHistory` and every repository
  method scope by `(lessonId, studentId)`; the unique constraint makes cross-student access
  unrepresentable.
- **Security event shape** — six fields enumerated explicitly in `securityLog.ts`, so a caller
  passing an extra field cannot leak it.

## Not verified

- No tests, evals or type-checks were run for this review; every claim is from reading.
- Runtime behaviour of LangGraph's default `recursionLimit` in this version was not confirmed
  empirically — F6's "25" is the documented default, not a measurement.
- Latency and spend of the L2 call remain unmeasured (S13 §22); F2 raises the stakes on that gap but
  does not close it.

---

## Suggested order of work

| # | Finding | Effort | Why this order |
|---|---|---|---|
| 1 | **F2** L2 timeout | ~30 min | One constructor argument; removes a user-visible hang and repairs the fallback signal |
| 2 | **F1** validate on abort | ~1 h | Restores the compensating control that S13 §2's accepted risk is priced against |
| 3 | **F4** structured tool result | ~1 h | Protects a zero-baseline signal from silent death; touches one tool and one test |
| 4 | **F7** fix S9/S6 | ~15 min | The document is the spec for the next AI surface |
| 5 | **F3** retract → ineligible | ~2 h | Needs the save moved into the service; do it with F1 since both touch that path |
| 6 | **F6** per-feature key + `recursionLimit` | ~1 h | Cost control, and corrects §17 |
| 7 | **F5** character budget | ~1 h | Cost and dilution; least urgent because message length is already capped |

None of these is a prompt change, so none requires an eval run before merge. F1, F3 and F4 each want
a unit test in `lessonAI.service.test.ts`; F2 wants one in `guardUserInput.test.ts`.

**Still the highest-value item overall** is S13 §13 — nothing consumes the security events. Five of
the seven findings above are about signals, and every one of them is a signal emitted into stdout
that no one reads. Fixing the emitters is worth doing; it is worth less than giving them a
destination.