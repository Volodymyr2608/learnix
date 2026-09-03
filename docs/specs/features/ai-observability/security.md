# Security — ai-observability

Complex tier, and the tier came from a mechanical verdict rather than a judgement: attaching the
metrics handler inside `checkTopicRelevance` puts a non-test file under
`server/services/_shared/aiGuard/` in the diff, which is `pnpm classify`'s **`ai-guard` control
signal**. Per `documentation-process.md` §3a a guarded verdict is complex tier, full stop.

**No design pass ran, and that is the rule rather than a shortcut.** §3d: *"Modified control → no
design pass. One auditor, pointed at that control, with a false-positive check on legitimate input,
not only a recall check."* This feature introduces **no new authority** — it adds a read-only observer
to model calls that already happen, creates no route, procedure, tool, model, migration or
environment variable, and grants nothing new to anybody. Re-deriving the controls the tutor and the
builder already enforce would be pure cost. What follows is therefore an inheritance record, one
modified control, and the residuals this feature genuinely adds.

The audit at `/qa` is **`llm-security-auditor` in `audit` mode**, scoped to the file list `pnpm
classify` prints — which will be `topicRelevance.ts` plus the `aiMetrics` module.

---

## S1. What this feature is, in security terms

A read path over telemetry, with one write: a log line. It reads callback arguments describing a
model call and emits scalars. It makes no model call of its own, renders nothing to a user, persists
nothing, and takes no branch that any other code depends on.

The whole security question for a feature shaped like this collapses to one thing: **a log line is a
disclosure channel**, and the callbacks it reads carry the most sensitive text in the application —
fully rendered prompts, model replies, and error messages containing raw model output.

## S2. The primary threat — prompt or reply text reaching a log through this handler

`handleLLMStart` receives `prompts: string[]`: the fully rendered prompt, which by construction
contains untrusted course content, untrusted student messages, and the system prompt itself.
`handleLLMEnd` receives the model's complete reply. Both are one property access away from the
emitter.

`error-observability`'s S2 established that this class of leak is real here rather than theoretical:
three LangChain constructors put untrusted payload directly into `Error.message` —
`OutputParserException` (the entire model output), `ToolInputParsingException` (the model-generated
tool call), and LangGraph's `InvalidUpdateError` (a state channel value).

**Control — the field set is closed by type (spec AC 4, AC 6, AC 7).** The event type has no field
whose type admits a string of call content: `feature`, `node`, `model` and `errorName` are the only
strings, and all four are server-authored or a class name. There is no `prompt`, `reply`, `message`,
`content` or `input` field to populate. A contract test asserts every emitted value is a primitive
scalar, mirroring `aiLogShape.contract.test.ts`.

This is deliberately the same mechanism `logSecurityEvent` uses, and for the reason its own comment
gives: *"The field set is exhaustive by type: there is no field to pass message text… That is the
enforcement mechanism for 'no event carries free text' — not a redaction step that can be
forgotten."* A redactor is a step someone can skip; an absent field is not.

**Reinforcing control:** the handler reads `runId` and the model id from `handleLLMStart` and never
touches `prompts`. `handleLLMEnd` is read only for `usage_metadata`. `handleLLMError` reads `err.name`
and never `message`, at any depth.

## S3. The modified control — metering inside the L2 guard

`checkTopicRelevance` is Layer 2 of the input guard: an LLM relevance classifier that runs before
every tutor turn, with a 3 s timeout whose exceedance throws onto `guardUserInput`'s fail-open path
and emits `fallback_triggered` / `["l2_unavailable"]`.

The change is one added `callbacks` entry in the config passed to `model.invoke`. It adds no branch
and reads no verdict. But it is a control surface, so the burden of proof is on the change, not on
the reviewer.

**Control (spec AC 11), verified both directions** — the pairing §3d requires:

| Property | Test |
|---|---|
| Recall preserved | an off-topic message is still blocked |
| **False positive not introduced** | an **on-topic** message is still allowed |
| Fail-open preserved | an L2 timeout still yields `fallback_triggered` with `ruleIds: ["l2_unavailable"]` |
| Budget preserved | `timeout: 3_000`, `maxRetries: 1` unchanged |

The false-positive half is the one that matters here. A meter that made L2 marginally slower could
push borderline calls past the 3 s budget, converting *allowed* turns into fail-open ones — degrading
the guard without any test failing on recall. Hence the < 1 ms overhead budget in the spec's
Performance section, and hence measuring both directions.

## S4. Availability — the meter must not break the path it measures

`logSecurityEvent` already carries this reasoning, having hit it once: its Sentry forward is wrapped
because *"a throwing sink would not merely lose an event — it would propagate out of the policy and
fail the student's turn. The alert path must not be able to break the path it is watching."*

The same applies with more force here, because this handler runs on **every** model call on every
surface, including inside the guard.

**Controls:** the emit is wrapped in `try`/`catch` (spec AC 9), verified by stubbing the logger to
throw and asserting a tutor turn and a courseAI turn both still complete and still return content.
LangChain's `BaseCallbackHandler` additionally defaults `raiseError` to falsy, so a throwing handler
is swallowed by the framework — but that is a second line of defence, not the control, because it is
a library default this feature does not own.

No emit path awaits network I/O, and none serializes message content.

## S5. Quota — metrics must not consume Sentry's event budget

`server/utils/logger.ts` forwards **only** `error`-level entries to `reportError`, and the Sentry free
tier is 5 000 events/month. One metric line per model call at `error` level would exhaust it in
normal operation and blind the platform to real errors — the same flood pattern
`error-observability` S6 documents, arrived at from the opposite direction.

**Control (spec AC 10):** metrics are emitted at `info`, and a contract test fails on any
`logger.error` inside `server/services/_shared/aiMetrics/**`. The existing
`importBoundary.contract.test.ts` independently prevents importing the Sentry SDK directly from
anywhere in `server/`.

## S6. Inherited, not re-derived

The surfaces this feature observes keep every control they already have; nothing here relaxes one.
Inherited by reference:

- [`ai-tutor-guardrails/security.md`](../ai-tutor-guardrails/security.md) — S2 trust boundaries, S6
  injection handling, S7 tool restrictions, S8 input/output validation, S11 logging and monitoring.
- [`error-observability/security.md`](../error-observability/security.md) — S2 model text in error
  messages, S6 quota flood, S10 reporting off the critical path, S19-class "no free text" rules.
- ADR-022 (input trust boundary), ADR-026 (shared defence layers), ADR-029 (allowlist projection,
  and the "Sentry owns errors, LangSmith owns AI traces" division this feature does not cross).

## S7. New residual — `userId` in a third stream

Metric context carries `userId` and `courseId`, matching `projectError.ts`'s allowlist vocabulary so
the two streams join. That puts a user identifier into a third log stream, alongside the security-event
log and Sentry.

**Accepted, with a smaller blast radius than either predecessor:** the destination is the application's
own stdout, not a new processor — no third party receives it, so `error-observability` S13's GDPR
analysis (a new processor for `userId`) does not extend. The identifier is the same opaque `User.id`
already present in both existing streams, and it is what makes "which user's turns are slow" a
question with an answer.

## S8. New residual — one turn's cost is now inferable from logs

A summary line states what a turn cost. Anyone with log access can see which users, courses, or
lessons generate expensive turns. This is the feature working, not a leak: log access is already
privileged, and the same reader can see security events and errors today.

**Accepted.** No content is exposed — only counts, durations and money.

## S9. Named gap — embeddings are metered by neither system

`search` and the `pnpm reindex` backfill call `OpenAIEmbeddings` and will remain unmeasured after this
ships. Two structural reasons, neither of them effort: LangChain's `Embeddings` base class exposes no
callback surface, so this feature's mechanism cannot reach it; and `OpenAIEmbeddings` discards the
API's `usage`, so tokens there could only be estimated from text length.

**Impact is bounded and worth stating**: `text-embedding-3-small` is roughly $0.02 per million tokens
against $0.15–$2.50 for the chat models here, so the unmeasured share of spend is small — but *small*
is an estimate, and this feature exists precisely because estimates were being used where measurements
belong. Recorded so a later "why is the total short" reads this first.

Closing it needs a different mechanism (a wrapper at `embeddings.service.ts` with estimated tokens),
and a second `feature` vocabulary, because `AiFeature` is a closed five-member union shared with
`logSecurityEvent` and `AI_SURFACES`.

## S10. Named gap — this feature narrows `error-observability` S16 without closing it

S16 records that with LangSmith off and Sentry seeing only `error`, everything below `error` that does
not throw reaches no human — specifically `quizAI.service.ts:146,155` (three attempts per generation)
and every retry-exhaustion path.

This feature makes the *volume* visible: quizAI's three attempts now appear as three call lines in one
turn summary, so the amplification is countable. The *reason* an attempt failed is still not, and S16's
warning stands unchanged and must be repeated here because this feature makes the temptation
stronger: **promoting those two lines to `error` without first applying the class-only rule would be a
leak** — `quizAI.service.ts:155` logs the raw thrown error, which is the `OutputParserException` shape
from S2.

## S11. What `/qa` must check

For `llm-security-auditor` in `audit` mode, scoped to the classifier's file list:

1. No path reads `prompts`, message `content`, or `Error.message` — at any depth (S2).
2. The event type still admits no free-text field, and the scalar-only contract test still passes (S2).
3. L2's verdict, timeout, retry count and fail-open path are unchanged, proven in **both** directions —
   recall and false positive (S3).
4. The emit cannot throw into a turn (S4).
5. No `logger.error` in the module; no direct Sentry import (S5).
6. The residuals in S7–S10 are still accurate, and no new stream or destination was added.
