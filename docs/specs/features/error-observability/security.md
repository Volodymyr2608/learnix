# Security — error-observability

**Status:** design (produced at `/spec`, 2026-08-23) · **Tier:** complex ·
**Method:** `security-auditor` and `llm-security-auditor`, both in **`design` mode**, dispatched in
parallel over the drafted [`spec.md`](./spec.md) before any code existed — the pass
`../distributed-ai-rate-limiter/security.md` S8 records as skipped for that feature. Every
load-bearing claim below was verified against code or against the installed package.

Written as requirements, so it can be followed without reading the implementation. Every control here
appears as an acceptance criterion in [`spec.md`](./spec.md) — that is what makes `/plan` unable to
omit it and `/qa` able to check it back.

Prior art: [`../ai-tutor-guardrails/security.md`](../ai-tutor-guardrails/security.md) (S13 §13, the
residual this feature partly closes; S13 §12 on security-event retention) and
[`../distributed-ai-rate-limiter/security.md`](../distributed-ai-rate-limiter/security.md) (S4, the
fail-closed availability trade; its AC 25 is the binding precedent on log content).

---

## S1. What this feature defends

The subject is a **new egress channel**. Data that has never left the process now goes to a US
third-party processor, and a budget that has never existed now exists and is exhaustible.

**Assets**

- **The error stream's confidentiality.** It now leaves the process, carrying whatever the
  application's error objects happen to contain.
- **The error stream's availability.** 5 000 events per month, after which Sentry *drops* rather than
  bills. A burnt quota is not a cost overrun; it is the platform going blind for the rest of the
  calendar month.
- **Personal data reachable through error text** — email addresses, search queries, student chat
  input, `userId`; and, on AI paths, lesson content and model replies, which are FERPA/GDPR-class
  educational data.
- **Secrets and internals reachable through `cause` chains and stack frames** — Prisma argument
  dumps, `@upstash/redis` command bodies, Stripe and Resend API errors, and via source maps
  `server/services/_shared/aiGuard/patterns/`.
- **Request-path latency**, because capture now sits inside three SSE routes under a 120 s turn
  deadline (`_shared/aiLimits/modelDefaults.ts`).

**Actors**

- A logged-in student or instructor, legitimate but malicious.
- An anonymous internet actor — reduced to a minor actor by S5's server-only decision, but still able
  to reach `publicProcedure`s and the AC 7 server action.
- An operator who deploys without `SENTRY_DSN`. Not an attacker, and the single most likely reason
  this feature is absent in production (S8).
- **A non-actor that matters more than any of them:** a dependency outage, which under a naive design
  becomes a self-inflicted quota flood (S6).

**Not in scope**

- Classic authorization. This feature adds no route, no procedure, no schema change and accepts no id
  from input, so IDOR, mass assignment, role elevation and SQL injection have no new surface. The one
  construct that *would* have created a public endpoint is `tunnelRoute`, kept out by AC 34.
- SSRF. The only server-side fetch added targets a DSN host fixed at build time.
- Middleware bypass (CVE-2025-29927 class) — there is no `middleware.ts` in the tree and this adds none.
- Rendering attacker-controlled text in the Sentry UI. Sentry escapes it; not our surface. Injection
  *into* the issue title is ours, and is AC 22.

## S2. The primary threat — model text and personal data in error messages

The application's error objects are not neutral carriers. Three constructors in the installed
LangChain packages put untrusted payload text **directly into `Error.message`**:

| Shape | Site | What it embeds |
|---|---|---|
| `OutputParserException` | `@langchain/core/dist/output_parsers/openai_tools/json_output_tools_parsers.js:150,156`; `structured.js:76,150` | the entire model output, in the message *and* again as the second constructor argument |
| `ToolInputParsingException` | `@langchain/core/dist/tools/index.js:113,120` | `JSON.stringify` of the model-generated tool call |
| `InvalidUpdateError` | `@langchain/langgraph/dist/pregel/algo.js:120` | a courseAI state channel value — `userMessage`, `assistantText`, `history`, `content` |

`withStructuredOutput` is used at 12 sites, including all three `lessonInsightsAI` chains over lesson
content and — the one that matters most — `_shared/aiGuard/topicRelevance.ts:61`, whose schema is
`z.object({ onTopic: z.boolean(), reason: z.string() })`. That `reason` is a model-authored
restatement of the very student message the guard is screening, so the guard's own fail-open path can
transmit what it was built to contain.

Prisma has the same defect with different payloads: `PrismaClientValidationError` renders the
offending call **with its argument values**, and a raw-query failure in `embedding.repository.ts`
produces a message containing SQL text and bound parameters. `@upstash/redis` builds its message as
`` `${body.error}, command was: ${JSON.stringify(req.body)}` ``.

**Four live routes into a payload**, all present in today's code:

1. `lessonInsightsAI.service.ts` does not wrap its chain invokes → `routers/lessonInsightsAI.ts:22` →
   `handleServiceError.ts:15-20`, which copies `error.message` **verbatim** into a `TRPCError`. The
   Sentry issue *title* becomes lesson-derived model text — and so does the browser's error message,
   today, with no Sentry involved.
2. `learningPathAI/nodes/mergeAndExplain.node.ts:285` → `app/api/chat/learning-path/route.ts:69`,
   which this feature converts from `console.error` to `logger.error`.
3. `courseAI/graph/withNodeErrors.ts:21` logs `{ …, err }` raw, then rethrows `FatalNodeError`
   carrying `cause: err` → `app/api/chat/course/route.ts:216` logs it again.
4. `aiGuard/guardUserInput.ts:103` — the L2 fail-open described above.

**Control — an allowlist, not a scrubber.** [`spec.md`](./spec.md) **AC 10** is the enforcement point:
the reporter transmits a constructed projection with a closed field set, in the manner of
`securityLog.ts:11-25` — *"exhaustive by type: there is no field to pass message text into… that is
the enforcement mechanism, not a redaction step that can be forgotten."* A denylist has to anticipate
each leaky format; an allowlist does not. `beforeSend` remains as defence in depth (AC 15, 16, 22).

Supporting controls: **AC 11** (tested against `eventFromException()`, across all
`exception.values[]`), **AC 12** (`handleServiceError` stops propagating raw messages — this closes a
disclosure that exists today, independently of Sentry), **AC 13** (the three LangChain shapes as
fixtures), **AC 14** (`linkedErrors` walks `cause` five deep, so redacting the top frame transmits the
raw original), **AC 15** (the class-only denylist), **AC 19** (class-only at every AI catch site),
**AC 20** (no model client, agent or graph state ever passed to `logger.*` — `ChatOpenAI` holds
`apiKey` as an instance field), **AC 21** (`LEAK_MARKERS` as the test oracle, never the runtime
control, per S13 §27).

**The regulated material is not the system prompt.** The prompts were read: pedagogy only, no
credentials, no identifiers, no cross-tenant data. A system prompt in a payload would be an
embarrassment, not a breach. The material that matters is **lesson content, student messages and
model replies** — and the highest-volume leak path, retrieved chunks and tutor replies, carries no
leak marker at all. A marker scan must not be mistaken for the control.

## S3. Email addresses are staged for transmission today

`server/services/email/email.service.ts:62-66`:

```ts
logger.error("resend_failed", {
    templateKey: input.templateKey,
    toEmail: input.toEmail,
    error,
});
```

[`spec.md`](./spec.md) §4 forwards every `logger.error` to Sentry, so **on the day this ships, every
failed send transmits a real user's email address to a third-party processor.** AC 18 as originally
drafted would not have caught it: it forbids `user.email`, and this arrives through `extra`. The same
address arrives a second way through `ResendSendError(error.message)` (`email.errors.ts:17-22`),
re-logged at `enrollment.service.ts:111` and `instructor.service.ts:93`.

**Control.** **AC 16** (scrub addresses from every string leaf of the event, tested against this exact
payload) and **AC 17** (remove `toEmail` at the source, replace with `userId`, plus a source scan
banning `email`/`toEmail`/`fromEmail`/`replyTo` as `logger.*` keys). AC 16 is the net; AC 17 is not
putting the fish in the water.

## S4. Grouping and issue titles are attacker-reachable

Instructor-authored lesson content and student chat messages are attacker-controllable text that flows
through the AI services. If any of it survives into an error message, the author chooses the Sentry
issue title *and* the grouping fingerprint — which allows deliberately fragmenting one real error into
a thousand issues to bury it, or putting directed text in front of whoever reads the dashboard.

**Control.** **AC 23** (fingerprint from server-authored values only — tRPC `path` or route plus error
class, never the message) and **AC 22** (surviving strings are length-capped and stripped of control
characters and newlines, so an issue title cannot fake a second log line).

## S5. New residual, deliberately reduced — the browser SDK is not shipped

`NEXT_PUBLIC_SENTRY_DSN` is in the bundle by definition and cannot be made secret. Anyone may `POST`
envelopes to the ingest endpoint with no credential, and per-key rate limits are not available on the
Developer plan. That is (a) a quota kill switch for any stranger with a script, and (b) an integrity
problem — fabricated issues with attacker-chosen messages and stack frames.

Two further disclosure paths exist specifically in the browser: `trpc/client.tsx:52` uses
`httpBatchStreamLink`, so queries are `GET /api/trpc/…?input={…}` and the SDK records that full URL in
`event.request.url` and in a `fetch` breadcrumb on every later event; and `:47-51` enables
`loggerLink` in production, which `console.error`s the operation **including its input**, which
Sentry's default `Console` integration converts into breadcrumbs.

**Decision: v1 is server-side only** (AC 28 — `NEXT_PUBLIC_SENTRY_DSN` is *not declared*, and not
declaring it is the control). This removes all three threats outright rather than mitigating them.
Client-side render errors are still reported through the AC 7 server action, whose Zod input is a
closed scalar shape `{ digest?, errorClass, route }` — it is a public write path, so its schema is
what stops it becoming an arbitrary-text relay, and AC 24's throttle applies to it.

**Residual:** browser-only failures that never reach a server action — a JS exception in a passive
component, a failed asset load — remain invisible. Accepted. Revisit when browser reporting is specced
as its own feature; it needs its own project, its own DSN, Inbound Filters on Allowed Domains, and the
`Console` integration removed.

## S6. New residual — a dependency outage is a quota flood

`_shared/aiLimits/store/upstash.store.ts:118` fails closed and logs once **per AI request**. Under
AC 5 every one of those becomes a Sentry event, so an Upstash outage burns 5 000 events in minutes —
*precisely during the incident the tracker exists to make visible*. `email.service.ts:62` has the same
shape under a Resend outage, and `safeRequest` under a database blip on an anonymous marketing page.
Sentry's `Dedupe` integration only suppresses consecutive identical events and does not bound this.

**Control.** **AC 24** (per-fingerprint throttle, 10 per 60 s) and **AC 25** (the map uses the repo's
`EVICT_THRESHOLD = 5_000` eviction shape so a high-cardinality stream cannot grow it without bound).

**Residual — the throttle is per-process.** With N Vercel instances the effective cap is
`N × SENTRY_MAX_PER_FINGERPRINT`. This is the same construction ADR-027 rejected for the rate limiter,
and it is accepted here for the opposite reason: a Redis round trip per *error report* is a worse
trade than an imprecise cap, and unlike the limiter this bounds a budget rather than an authorization
decision. Informational, not a gap.

## S7. Unauthenticated quota consumption through the app

`user.signUp` (`routers/user.ts:16`) and `instructor.create` (`instructor.ts:16`) are
`publicProcedure` — the latter intentionally, per ADR-017 Rule 5. AC 4 excludes mapped client-fault
codes, but an *unmapped* throw is reported, and a Prisma P2002 on a duplicate email currently surfaces
as `INTERNAL_SERVER_ERROR` through `handleServiceError.ts:16-19`. A script hitting signup with one
repeated address burns the quota with no session and no browser DSN.

**Control.** **AC 26** (both duplicate-key paths throw `CONFLICT`, which AC 4 excludes) and **AC 27**
(AC 24's throttle asserted on the `publicProcedure` path, because AC 26 is a mapping a future refactor
can quietly undo).

**AC 4 alone is about a quarter of the answer.** It stops the frequent-and-benign class, which is
worth having. It does nothing about S6 (those are `logger.error`, not `TRPCError`s), S9 (each event is
legitimately distinct), or this section (unmapped throws are on the reporting side of its line).
AC 4 + AC 24 + AC 26 + AC 2 is the sufficient set.

## S8. The failure mode most likely to make all of this moot

A missing `SENTRY_DSN` in production leaves the application exactly as it is today, with the whole
suite green and no signal that anything is wrong. ADR-027 names the identical failure mode for the
identical reason.

**Control.** **AC 30** (startup fails when the environment is not on the allowlist and the DSN is
absent) and **AC 31** (the allowlist is `development`/`test`, not `NODE_ENV !== "production"`, because
`.default("development")` does not apply under `SKIP_ENV_VALIDATION`). Plus **AC 32** (`environment`
from `VERCEL_ENV`, so previews do not merge into production's stream).

## S9. Double capture

Two paths report one failure twice, halving the quota:

1. **The RSC path.** `lib/requests/**` calls `createCaller`, so an exception passes through
   `timingMiddleware` (captured, AC 1), propagates, and is caught by `safeRequest` (captured again).
   Two events per RSC failure across all 33 sites. **Control: AC 2** — a non-enumerable
   `__sentryCaptured` marker; `safeRequest` attaches its operation tag to the existing event.
2. **The courseAI SSE path.** `withNodeErrors.ts:21` and `app/api/chat/course/route.ts:216` both log
   the same failure at error level. AC 1's "exactly once" covers tRPC only. **Residual or fix** —
   recorded in `spec.md`'s Agent notes: drop the node-level log to `debug` or make it a breadcrumb, or
   accept that courseAI consumes quota at 2× its failure rate. Quota only; no confidentiality impact
   once AC 10 holds.

## S10. Availability — reporting must not be in anyone's critical path

`app/api/chat/lesson/route.ts:173` and `app/api/chat/learning-path/route.ts:69` sit inside a
`ReadableStream` `start()`, after headers are flushed. Every serverless Sentry guide recommends
`await Sentry.flush()` because Vercel freezes the function — done naively here, an unreachable ingest
host adds the flush timeout to every turn.

**Control.** **AC 38** (no capture path awaits network I/O; no `flush()` inside an SSE body; explicit
`SENTRY_FLUSH_TIMEOUT_MS ≤ 2_000` and explicit `shutdownTimeout`) and **AC 39** (with the transport
stubbed to hang, a procedure and an SSE turn complete with unchanged latency and output). The bound is
the same order of magnitude and the same argument as ADR-027's `STORE_TIMEOUT_MS = 1_000`: a
dependency outage must not become resource exhaustion on our own side. **AC 41** keeps client aborts
out of the stream entirely.

## S11. Source maps

**Control.** **AC 35** — `deleteSourcemapsAfterUpload: true`, asserted by a post-build check that no
`.map` exists under `.next/static` (without it the maps are uploaded *and* served publicly);
`widenClientFileUpload: false`, because it additionally uploads server chunks and would place
`_shared/aiGuard/patterns/**` — a detector whose value is partly its non-publication — into the Sentry
artifact bundle. **AC 29** — `SENTRY_AUTH_TOKEN` is project-scoped `project:releases`, build-environment
only, never `NEXT_PUBLIC_`, never in `runtimeEnv` (a build credential in the runtime env object is
reachable from every server module that imports `env`), with a source scan and a post-build scan.

**Residual:** client-bundle source is legible to any Sentry org member. Accepted; the compensating
control is org membership, and no secret lives in client source.

## S12. Security events — S13 §13 partly closes

`ai-tutor-guardrails/security.md` S13 §13 records that *"nothing consumes the security events… this is
the single cheapest thing left to fix."* This feature is one line from fixing it — but
`securityLog.ts:12` uses `logger.warn`, and AC 5 forwards only `logger.error`, so without an explicit
decision AC 37's permission would be dead text.

**Decision.** **AC 36** — the four **zero-baseline** outcomes (`unsafe_tool_call`,
`fallback_triggered`, `mastery_write_retained`, `content_revised_retained`) are forwarded by an
explicit `Sentry.captureMessage` at `warning`, one fingerprint per outcome. Their normal rate is zero,
so any occurrence is itself the signal and no denominator is needed. **AC 37** — the three
**rate-based** outcomes (`guard_blocked`, `guard_suspect`, `guard_off_topic`) are **not** forwarded:
S11 thresholds them per user and as ratios, which needs a query layer an error tracker does not have,
and they are attacker-triggerable, so forwarding them would hand out S6's quota lever.

The `SecurityEvent` type carries this safely: seven closed fields, no field for message text, reply
text or a concept name, with `securityLog.ts:11` enumerating rather than spreading. AC 37's contract
test pins the one structurally-open field (`ruleIds: string[]`) to compile-time literals so the
property survives new callers.

## S13. New residual — `userId` at a new processor, and GDPR

AC 18 puts `userId` into Sentry. `../account-deletion-data-retention/spec.md:104` already places
erasing `userId` from security-event logs and LangSmith traces out of scope, and
`../ai-tutor-guardrails/threat-model.md` **R8** carries it as an open Medium.

**Decision: accepted as a residual, not closed.** The alternative — `userService.anonymiseAccount`
calling a Sentry user-deletion API — adds an external failure surface inside a transaction whose 14
`Restrict` relations already make it delicate (ADR-025), and a failing external call inside the
deletion path is a worse risk than the one it closes.

**Impact:** for up to Sentry's retention window (30 days on the Developer plan — confirm against the
plan actually provisioned and record the number here at `/qa`), a deleted user's id remains linkable
to their error events inside a US processor.

Worth stating plainly: this is **narrower than the existing R8**, not an addition to it. Unlike stdout,
whose retention is undefined, and unlike LangSmith as currently configured, Sentry has a fixed
documented retention *and* a data-deletion API — so this is the first instance of the R8 class that is
actually dischargeable later. R8's scope widens from "LangSmith" to "LangSmith and Sentry", and that
edit is a `/qa` Gate Docs item.

**Also outside the code, inside the complex-tier gate:** an Art. 28 DPA with Sentry Inc., an Art. 44
transfer mechanism, the privacy notice naming Sentry as a sub-processor, and the EU-vs-US ingest
region choice — which is irreversible per project and materially simplifies the transfer question if
taken at signup. Flagged for the developer; not a code control.

## S14. New residual — redaction is unmeasured in production

AC 11–21 prove the shapes we anticipated, and AC 21 proves the tests are non-vacuous. They cannot
prove the absence of a shape nobody thought of.

**Impact:** an unknown PII shape reaches Sentry until observed. **Closing action:** a one-time manual
review of the first ~50 production issues, recorded as done. A second, standing residual: a Sentry
integration added on a later SDK upgrade (`extraErrorDataIntegration`, `captureConsoleIntegration`)
reintroducing an uncovered path — mitigated by pinning the integration list explicitly rather than
relying on defaults.

`@sentry/nextjs` is not yet in `package.json`, so `linkedErrors` depth, `Dedupe` semantics, the
default integration set and the sourcemap defaults must each be re-verified against the installed
version at `/plan` time. AC 14, 24 and 35 each depend on one of them.

## S15. New residual — class-only logging loses the diagnostic

`lessonAI.service.ts:240` going from silent to class-only is a large net gain, but "why did the tutor
fail mid-stream" is not answerable from a class name. **Accepted**: that detail belongs to LangSmith
under `ai-observability`'s retention policy — which is exactly the ADR-013 division
[`spec.md`](./spec.md) argues for.

## S16. Named gap — what is observable in neither system until `ai-observability` ships

LangSmith is off in production and Sentry sees only `error` level, so everything below `error` that
does not throw reaches no human: `quizAI.service.ts:146,155` (`logger.warn` on semantic-validation
failure and on a thrown attempt, three attempts per generation), and every retry-exhaustion path
ending in a neutral user-facing message.

AC 36 closes part of this — `quizAI`'s terminal give-up emits `fallback_triggered`
(`quizAI.service.ts:167-175`), which is one of the four forwarded outcomes, so "a model being steered
into repeated invalid output" now does reach a human. What remains invisible is the *per-attempt*
detail beneath it.

Deliberately not closed here. `quizAI.service.ts:155` logs the raw thrown error — exactly the
`OutputParserException` shape from S2 — and is safe today only because AC 5 sets the threshold at
`error`. **Promoting those two lines to `error` without first applying AC 19's class-only rule would
be a leak.** Recorded so that a future "just make it visible" change reads this first.

ADR-013's "errors ≠ traces" division is clean; this is the hole in the middle that neither owner
covers, and naming it is what keeps the claim honest.