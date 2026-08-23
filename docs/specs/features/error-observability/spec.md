---
feature: error-observability
status: in-progress
models: []
depends-on: []
---

## Purpose

Every log this application writes goes to exactly one place: the Node process's stdout.
`server/utils/logger.ts` is a seven-line `createConsola()` with no reporters, and no Sentry, Axiom,
OTel or any other sink appears in `package.json`. On Vercel that means ephemeral Function Logs — no
grouping, no search, no alerting, and nothing that survives the retention window. Nobody is notified
when anything breaks.

The gap is worse than "no dashboard", because the application does not merely fail to *forward* its
errors — it **discards** them:

| Hole | Where | Effect |
|---|---|---|
| RSC data errors are swallowed | all 34 files in `lib/requests/**` | a failed query renders an empty page; nothing is recorded |
| tRPC error logging is dev-gated | `app/api/trpc/[trpc]/route.ts:23-30` — `onError` is `undefined` unless `NODE_ENV === "development"` | **zero** tRPC error logging in production |
| No error middleware | `server/api/trpc.ts:97-112` — `timingMiddleware` never wraps `next()` in a `try` | a throwing procedure skips even its own timing line |
| Tutor provider failures discarded | `server/services/lessonAI/lessonAI.service.ts:240` — `catch (_error)` | every tutor model failure is invisible |
| `DomainError.context` dropped | `server/utils/handleServiceError.ts:7-13` passes only `code`, `message`, `cause` | the `{ lessonId }` bag every `.errors.ts` carefully populates reaches nothing |
| No error boundaries at all | no `error.tsx`, `global-error.tsx` or `instrumentation.ts` anywhere in the tree | uncaught render errors hit Next's default page, unreported |

**Scope note.** Filed as **complex** tier because it introduces a new external service (Sentry).
Two user-visible behaviours *do* change, both deliberately and both found by the `/spec` threat pass:
an unmapped server error now returns a fixed message instead of the raw `Error.message` (AC 12 — that
message can currently contain model output), and duplicate-signup collisions now map to `CONFLICT`
instead of `INTERNAL_SERVER_ERROR` (AC 26). Nothing else about what a user sees changes: a request
that renders an empty page today still renders an empty page — the difference is that somebody now
finds out.

**Server-side only in v1.** No browser SDK, no `NEXT_PUBLIC_SENTRY_DSN`, one Sentry project. A public
DSN is an unauthenticated write endpoint for the whole internet, and the free tier has no per-key
rate limit — so shipping it would hand any stranger the ability to exhaust a 5 000-event month and
blind the platform, and would additionally expose two live disclosure paths (tRPC inputs travel in
the query string via `httpBatchStreamLink`, `trpc/client.tsx:52`; `loggerLink` console-logs operation
inputs in production, `:47-51`). Client-side render errors are still reported, through a
closed-shape server action (AC 7). Browser reporting is a later decision, not a deferred task.

**What this feature is not.** AI observability is a separate, later feature (`ai-observability`,
[`ai-hardening-plan.md`](../../ai-hardening-plan.md) §3, Workstream D). LangSmith is already the
accepted single observability and evaluation system for AI features
([ADR-013](../../../adr/013-langsmith-tracing-evals.md)); it is wired but disabled, and **this
feature does not turn it on**. Out of scope: `LANGSMITH_TRACING` in production, `aiMetrics.ts`,
token/cost accounting, latency budgets as NFRs, the broken streaming `traced()` wrapper, trace
flushing, and the R8 trace-retention policy. AI code appears below only where it currently throws an
error away, writes a raw `console.error`, or leaks model text.

## Functional scope

**1. Sentry, errors only, server only.** `tracesSampleRate: 0`. The free tier allows 5 000 errors and
10 000 spans per month, and performance spans over AI work would duplicate — at quota cost — what
LangSmith already provides under ADR-013. The two tools do not overlap: **Sentry owns errors for the
whole app; LangSmith owns AI traces.** Profiling, session replay and cron monitoring are off.

**2. One capture point, chosen because it is the only one that sees everything.** tRPC is reached by
two independent paths that share no handler:

- client components → `fetchRequestHandler` (`app/api/trpc/[trpc]/route.ts`), which has `onError`;
- server components → `createCaller` (`trpc/server.ts:25`), which **never touches that route**.

`timingMiddleware` is chained onto `publicProcedure` (`server/api/trpc.ts:121`) and
`protectedProcedure` (`:131`), and every role procedure builds on those — so a middleware there is on
100% of procedures on **both** paths. That is where `captureException` lives, exactly once.

`handleServiceError` therefore does **not** capture. It enriches the Sentry scope with the
`DomainError.context` it currently discards, and rethrows. This refines
[ADR-010](../../../adr/010-domain-error-mapping.md):113 — which names `handleServiceError` as "the
single place to add cross-cutting behaviour (Sentry, structured logging)" — into *enrich here,
capture at the boundary*, because capturing in both places double-reports every service error and
spends the free-tier quota twice. ADR-029 records the refinement.

**3. What reaches Sentry is a projection, not an error object.** This is the load-bearing decision of
the whole feature, and it is an **allowlist, not a scrubber**. Three LangChain constructors put
untrusted payload text directly into `Error.message` — `OutputParserException`
(`@langchain/core/.../json_output_tools_parsers.js:150,156`, the entire model output, twice),
`ToolInputParsingException` (`tools/index.js:113,120`, the model-generated tool call), and LangGraph's
`InvalidUpdateError` (`pregel/algo.js:120`, a courseAI state channel value: `userMessage`,
`assistantText`, `content`). Prisma and `@upstash/redis` have the same defect with different payloads.
A denylist has to anticipate each of them; an allowlist does not. So the reporter forwards a
constructed object with a closed field set — the shape `logSecurityEvent` already uses, and for the
same stated reason: *there is no field to pass free text into*.

**4. `logger` gains a reporter.** `server/utils/logger.ts` forwards `error`-level entries — as
projections — to Sentry. It is the single chokepoint for all 31 existing importers.

**5. `safeRequest` replaces the copy-pasted swallow.** `lib/requests/_shared/safeRequest.ts` wraps the
`try/catch → console.error → return <fallback>` shape that all 34 files in `lib/requests/**` repeat.
Swallowing is a deliberate rendering decision and it **stays**; the error is reported first, tagged
with the operation name so Sentry groups by call site. The fallback is **not uniformly `null`** — 30
files return `null`, but several return a typed empty shape (`getEnrollmentStatus.ts:13` →
`{ isEnrolled: false, nextLessonId: null }`; `getPublishedCourses.ts:17` and
`getStudentEnrolledCourses.ts:16` → `{ courses: [], total: 0 }`; `getCoursesStats.ts:8`), so
`safeRequest` takes the fallback as a parameter and must be generic over it.

**6. Error boundaries.** `app/global-error.tsx` and `app/error.tsx` are created — neither exists today
— and report through a server action taking a closed scalar shape.

**7. Environment.** `SENTRY_DSN` is `.optional()` in `lib/env.js`'s `server:` block with its
`runtimeEnv:` entry. `SENTRY_AUTH_TOKEN` is build-time only and is read in `next.config.ts`, never
placed in `runtimeEnv` — putting a build credential in the runtime env object makes it reachable from
every server module that imports `env`. Optional keeps a fresh checkout and all three CI jobs
building; a **production assertion at point of use** is what makes optional safe, per
[ADR-027](../../../adr/027-distributed-ai-rate-limiting.md) §6 and
[`../distributed-ai-rate-limiter/spec.md`](../distributed-ai-rate-limiter/spec.md) AC 16/17 — never a
`zod` `.refine()`, because every test and every CI job sets `SKIP_ENV_VALIDATION`.

**8. Converted call sites.** Raw `console.*` on server paths becomes `logger`:
`server/services/vercel/vercel.service.ts` (3×, and it does not import the logger at all today),
`app/api/chat/lesson/route.ts:173`, `app/api/chat/learning-path/route.ts:69`,
`app/api/stripe/webhook/route.ts:80`, `app/api/uploads/route.ts:45`,
`server/services/_shared/aiLimits/store/upstash.store.ts:118`, and the `console.log` at
`server/api/trpc.ts:109`. The four client `console.error` sites use the AC 7 server action.
`lessonAI.service.ts:240` stops discarding `_error`. `scripts/**` keeps `console` — CLI progress
output is not telemetry.

## Acceptance criteria

**Capture — completeness**

1. A procedure that throws is reported exactly **once**, whether called from a client component
   (`fetchRequestHandler`) or a server component (`createCaller`).
2. An error captured by the tRPC middleware is marked (a non-enumerable `__sentryCaptured`), and
   `safeRequest` attaches its operation tag to that existing event rather than capturing a second one.
   `lib/requests/**` calls `createCaller`, so without this every RSC failure reports twice across all
   34 sites. Test: one throwing procedure reached through `safeRequest` produces exactly one event,
   carrying the operation tag.
3. The reported event carries `DomainError.context` (e.g. `{ lessonId }`), the tRPC `path`, and the
   error class name. `handleServiceError` attaches context and does not itself capture.
4. `TRPCError`s that are ordinary client-fault control flow — `UNAUTHORIZED`, `FORBIDDEN`,
   `NOT_FOUND`, `BAD_REQUEST`, `TOO_MANY_REQUESTS`, `CONFLICT` — are **not** reported. Only
   `INTERNAL_SERVER_ERROR` and unmapped throws are.
5. `logger.error` from any of the 31 importing modules reaches Sentry; `logger.info` and `logger.warn`
   do not (AC 36 is the one deliberate exception, and it does not go through the reporter).
6. An uncaught error in a server component, route handler or server action is reported via
   `onRequestError` in `instrumentation.ts`.
7. `app/error.tsx` and `app/global-error.tsx` report through a server action whose Zod input is a
   **closed scalar shape** — `{ digest?, errorClass, route }` — and which accepts no free text. It is
   a public write path, so it is subject to AC 24's throttle and its input schema is the control that
   stops it becoming an arbitrary-text relay into the issue stream.
8. All 34 files in `lib/requests/**` route failure through `safeRequest`, which returns **each call
   site's existing fallback unchanged** — `null` in 30 files, a typed empty shape in the rest — and
   tags by operation name so two different failing requests produce two distinct issues. A source scan
   asserts no `console.error` remains under `lib/requests/`. The rendering contract of every page must
   be byte-identical to today on the failure path; a file whose fallback changes shape is a bug, not a
   simplification.
9. No `console.*` remains in `server/**` or `app/**` outside `scripts/**`, asserted by a source scan.
   Each scan is proved non-vacuous by reintroducing one occurrence and watching it fail.

**Redaction — the projection is the control**

10. What the reporter transmits is a **constructed projection**, not the logged arguments: the error's
    constructor name, its `name` / `code` / `status` / `lc_error_code` when present, the static message
    string from the log call, and an allowlisted set of scalar context keys (`feature`, `node`, `path`,
    `op`, `lessonId`, `courseId`, `generationId`, `userId`). `message`, `cause`, `llmOutput`, `output`,
    `meta.cause` and every non-allowlisted property are dropped **before** `captureException`. The
    projection enumerates its fields explicitly — an extra field on a caller's object cannot leak
    through. This, not `beforeSend`, is the enforcement point; `beforeSend` is defence in depth.
11. **No model text is ever transmitted**: no prompt, system prompt, tutor reply, lesson content,
    course-generation message, retrieved chunk, or student chat message. Tested against events produced
    by Sentry's own `eventFromException()`, asserting across `event.exception.values[*].value` and
    `[*].type`, every entry `LinkedErrors` produces from a `cause` chain of depth ≥ 3, `event.extra`,
    `event.contexts`, and `event.breadcrumbs[*]`. A test that only clears `event.message` is asserted
    insufficient — the live leak path puts model text in `exception.values[0].value`, the issue title.
12. `handleServiceError` (`server/utils/handleServiceError.ts:15-20`) stops copying an unmapped
    `Error.message` into the `TRPCError`. An error that is neither `TRPCError` nor `DomainError` yields
    a fixed message plus its class name, so the original reaches neither the issue title nor the
    browser. Regression test: an `OutputParserException` thrown through a `lessonInsightsAI` procedure
    produces a `TRPCError` and a Sentry event, neither containing the model text. **This closes a leak
    that exists today**, independently of Sentry.
13. The three payload-embedding LangChain shapes are pinned as fixtures, each asserted to leave no
    substring of its payload in the transmitted event: `OutputParserException`,
    `ToolInputParsingException`, LangGraph `InvalidUpdateError`.
14. Redaction applies to **every** entry in `event.exception.values[]`, not the first. Sentry's
    `linkedErrors` integration walks `cause` five levels deep by default, and `DomainError` carries
    `cause` (`base.errors.ts:8`) which `handleServiceError` forwards (`:11`). Verified with a three-deep
    chain — `DomainError → TRPCError → PrismaClientKnownRequestError` — with the forbidden value only
    in the innermost link.
15. A denylist of error constructors reduced to **class-only**, in one exported constant, currently
    `{ UpstashError, PrismaClient*, StripeError, ResendSendError }`. One mechanism, one test, rather
    than a hand-maintained branch per library. `@upstash/redis` builds its message as
    `` `${body.error}, command was: ${JSON.stringify(req.body)}` `` — an `eval` body embeds the prefixed
    keys, which contain the `userId` and, on a scoped window, the `courseId`. This is the same
    constraint [`../distributed-ai-rate-limiter/spec.md`](../distributed-ai-rate-limiter/spec.md) AC 25
    already imposes on stdout; a third-party processor does not get a weaker rule. Prisma is included
    because `PrismaClientValidationError` renders the offending call **with its argument values**.
16. Email addresses are removed from the whole event — `message`, every
    `exception.values[].value`, and every string leaf of `extra`, `contexts`, `tags` — matching
    `/[\w.+-]+@[\w.-]+\.\w+/`. Tested with the exact `resend_failed` payload from
    `server/services/email/email.service.ts:62-66` and a
    `ResendSendError("Invalid \`to\` field: alice@example.com")`.
17. `toEmail` is removed from `email.service.ts:63-64` and replaced by the `userId`. A source scan
    asserts no `logger.*` call in `server/**` passes a key named `email`, `toEmail`, `fromEmail` or
    `replyTo`. Without this, **the day this ships every failed send transmits a real address to a
    third-party processor.**
18. `sendDefaultPii` is `false` and the event's `user` object contains exactly `{ id }` — no `email`,
    `username`, `ip_address`, or `"{{auto}}"` placeholder.
19. Every AI catch site this feature converts or adds logs the **error class only**:
    `lessonAI.service.ts:240`, `app/api/chat/{lesson,learning-path,course}/route.ts`,
    `courseAI/graph/withNodeErrors.ts:21`, `aiGuard/guardUserInput.ts:103`. The last is specific: L2 is
    `withStructuredOutput(z.object({ onTopic, reason: z.string() }))`, so a parse failure embeds a
    model-authored restatement of the message the guard was screening. Test: a mocked L2 throwing an
    `OutputParserException` carrying a marker produces a `fallback_triggered` event and a marker-free
    payload.
20. No model client, agent, chain, or graph state object is ever passed to `logger.*` — `ChatOpenAI`
    holds `apiKey` as an instance field and Sentry normalises `extra` to depth 3. Enforced by AC 10's
    allowlist, asserted by a source scan over `logger.error(` arguments.
21. `promptLeakMarkers.ts`'s `LEAK_MARKERS` is reused as the **test oracle** for the system-prompt half
    of AC 11 — it stays a detector and never becomes the runtime control. The redaction tests are
    proved non-vacuous by removing AC 10's projection and observing a marker appear.
22. Any string that survives into a payload is length-capped and stripped of control characters and
    newlines, so an issue title cannot inject an apparent second log line or carry a directive at
    whoever reads the dashboard.

**Quota — availability of the error stream is a security property**

23. Grouping is fixed server-side: each capture sets an explicit `fingerprint` from server-authored
    values only (tRPC `path` or route + error class), never from the message. Test: two same-class
    errors with different embedded text group into one issue.
24. `beforeSend` enforces a per-fingerprint throttle — at most `SENTRY_MAX_PER_FINGERPRINT = 10` per
    `SENTRY_THROTTLE_WINDOW_MS = 60_000`. The motivating path:
    `_shared/aiLimits/store/upstash.store.ts:118` fails closed and logs **once per AI request**, so an
    Upstash outage emits one event per request across every user — 5 000 gone in minutes, precisely
    during the incident the tracker exists to show you. Sentry's `Dedupe` only suppresses *consecutive
    identical* events and does not bound this. Test: 1 000 identical `UpstashError`-shaped events yield
    at most 10, and an interleaved different fingerprint is not suppressed.
25. The throttle map uses the repo's threshold-eviction pattern (the `EVICT_THRESHOLD = 5_000` shape
    from `aiLimits`), so a high-cardinality fingerprint stream cannot grow it without bound. Tested with
    10 000 distinct fingerprints.
26. `user.signUp` (`server/api/routers/user.ts:16`) and `instructor.create` (`instructor.ts:16`) are
    `publicProcedure`. Their duplicate-key paths throw a `DomainError` with code `CONFLICT` so AC 4
    excludes them — today a Prisma P2002 surfaces as `INTERNAL_SERVER_ERROR` via
    `handleServiceError.ts:16-19`, letting a script with no session burn the quota. Test: calling each
    twice with the same input yields `CONFLICT` and **zero** events.
27. AC 24's throttle is asserted on the `publicProcedure` path specifically: 1 000 anonymous signup
    collisions produce at most 10 events even if AC 26 regresses. Defence in depth — AC 26 is a mapping
    a future refactor can quietly undo.

**Wiring — and the failure mode that matters most**

28. `SENTRY_DSN` is declared in `lib/env.js` under both `server:` and `runtimeEnv:` and is
    **optional** — `pnpm build`, `pnpm test` and a fresh checkout all succeed without it.
    `NEXT_PUBLIC_SENTRY_DSN` is **not declared**; v1 is server-only and not declaring it is the control.
29. `SENTRY_AUTH_TOKEN` is build-time only: project-scoped with `project:releases` (not an org token,
    not `project:write`), read in `next.config.ts`, present in the Vercel **build** environment only,
    never prefixed `NEXT_PUBLIC_`, never in `runtimeEnv`, never referenced from application code. A
    source scan asserts it appears only in `next.config.ts`; a post-build scan asserts the string
    appears nowhere under `.next/`.
30. Startup **fails with a clear error** when the environment is not on the allowlist and `SENTRY_DSN`
    is absent. A missing production DSN must not degrade silently: that would leave the application
    exactly as it is today with the entire suite green, which is this feature's most likely way to fail
    — ADR-027 names the same failure mode for the same reason.
31. The allowlist is `development` and `test` — **not** `NODE_ENV !== "production"`. `lib/env.js`'s
    `.default("development")` does not apply under `SKIP_ENV_VALIDATION`, which that file recommends
    for Docker builds, so an unset `NODE_ENV` would otherwise hand a production deploy a silent no-op.
32. Sentry's `environment` is set from `VERCEL_ENV` (already declared) so preview deployments do not
    merge into production's issue stream.
33. `tracesSampleRate` is `0`, and a source scan asserts no `Sentry.startSpan` / `startTransaction`
    call exists, so the span budget cannot be consumed by accident.
34. `tunnelRoute` is **not** enabled in `withSentryConfig`, asserted by a source scan over
    `next.config.ts`. It would generate an unauthenticated route handler on our own origin forwarding
    arbitrary bodies to Sentry ingest — a new public endpoint under ADR-017 Rules 1 and 3, and an open
    relay that makes our domain the source of any flood.
35. Source maps: `sourcemaps.deleteSourcemapsAfterUpload` is `true` (a post-build check asserts no
    `.map` under `.next/static`, without which the maps are uploaded *and* served publicly), and
    `widenClientFileUpload` is `false` — it additionally uploads server chunks, which would put
    `_shared/aiGuard/patterns/**` into the Sentry artifact bundle.

**Security events — closing `ai-tutor-guardrails` S13 §13**

36. The four **zero-baseline** outcomes — `unsafe_tool_call`, `fallback_triggered`,
    `mastery_write_retained`, `content_revised_retained` — are forwarded by an explicit
    `Sentry.captureMessage` at `warning` from `logSecurityEvent`, one fingerprint per outcome. Their
    normal rate is zero, so any occurrence is the signal. This is a deliberate, named exception to
    AC 5, taken because S13 §13 records that "nothing consumes the security events… this is the single
    cheapest thing left to fix."
37. The other **four** outcomes are **not** forwarded — `guard_blocked`, `guard_suspect`,
    `guard_off_topic`, and `output_validation_failed`. The first three are rate-based: S11 thresholds
    them per user and as ratios, which needs a denominator and a query layer an error tracker does not
    have, and they are attacker-triggerable, so forwarding them would hand out AC 24's quota lever.
    `output_validation_failed` is excluded for a stronger reason —
    `_shared/conformance/aiSurfaces.ts:72` records it as report-only with a **measured ~10%
    false-positive rate**, emitted over *every persisted model-authored field*. It is the
    highest-volume outcome in the taxonomy and mostly noise by design; forwarding it is the S6 flood
    pattern with extra steps.
37a. The forward/don't-forward decision is a **`Record<SecurityOutcome, boolean>`**, not an array with
    `.includes()`. `SecurityOutcome` (`_shared/aiGuard/types.ts:72-86`) has exactly eight members; a
    total record means a ninth fails to compile until someone classifies it. An array would silently
    default it to "not forwarded" — which is the safe direction but the wrong mechanism, because the
    point is to force the decision, not to guess it. `SecurityEvent` (`types.ts:99-107`) stays seven
    closed fields with one `string[]` (`ruleIds`); its existing contract test already pins every value
    to a compile-time literal, so "free-text-free by type" survives new callers.

**Availability and regression**

38. No capture path awaits network I/O. `Sentry.flush()` is never called inside an SSE stream body;
    where called it takes an explicit `SENTRY_FLUSH_TIMEOUT_MS ≤ 2_000`, and `shutdownTimeout` is set
    explicitly rather than left at its default. Same reasoning and same order of magnitude as ADR-027's
    `STORE_TIMEOUT_MS = 1_000`: an unreachable dependency must not hold an SSE route open toward the
    120 s turn deadline (`_shared/aiLimits/modelDefaults.ts`).
39. With the transport stubbed to hang indefinitely, a tRPC procedure and one SSE turn complete with
    unchanged latency and unchanged output. This is what turns "reporting is best-effort" from a claim
    into a fact. Sentry initialisation failure — malformed DSN, unreachable host — must not take a
    request down.
40. `timingMiddleware`'s existing behaviour is preserved: the dev artificial delay, and a timing line
    on success. It additionally records timing when the procedure throws, which it does not do today.
41. Client aborts are never reported. `courseAI/graph/nodeErrors.ts:37-38` deliberately excludes
    `ModelAbortError` / `AbortError` from the failure signal, and SSE routes abort routinely when a
    user navigates away.
42. `pnpm typecheck`, `pnpm check`, `pnpm test:unit`, `pnpm test:integration` stay green, and CI's
    three jobs — which all set `SKIP_ENV_VALIDATION` and pass no Sentry secrets — pass unchanged.

## Security

Complex tier — the threat pass lives in [`security.md`](./security.md). Every control there appears
as an acceptance criterion above.

## Agent notes

- **The two tRPC paths are the whole reason the middleware is the capture point.** It is tempting to
  "simplify" by making `onError` in `app/api/trpc/[trpc]/route.ts` unconditional and calling it done.
  That handler is only reached by `fetchRequestHandler`; every RSC call goes through `createCaller`
  (`trpc/server.ts:25`) and would report nothing. Both would still look correct in a browser test.
- **Capture in exactly one place, or the quota halves.** ADR-010:113's "single place" line predates the
  middleware and is refined, not contradicted, by ADR-029.
- **AC 4 is a quota control, not a taste preference.** `NOT_FOUND` and `UNAUTHORIZED` are the most
  frequent errors any web app throws and are almost always client-fault. Reporting them would exhaust
  the budget in normal browsing, after which Sentry *drops* rather than bills — so the real failures
  vanish for the rest of the month.
- **AC 10's projection is the difference between a control and a hope.** A scrubber has to anticipate
  every leaky message format in every dependency; an allowlist does not. The cost is real and accepted:
  `error.message` is permanently unavailable from AI paths, and "why did the tutor fail mid-stream" is
  not answerable from a class name. That detail belongs to LangSmith under `ai-observability`'s
  retention policy — which is exactly the ADR-013 division this spec argues for.
- **`lib/requests/**` has two sub-shapes.** 28 of the 34 files use a descriptive prefix
  (`console.error("Error fetching …:", error)`); 6 use a bare `console.error(error)` —
  `getEnrollmentStatus`, `getCourseDetail`, `getPublishedCourses`, `getOwnCourseDetail`,
  `getStudentEnrolledCourses`, `search/getSemanticSearchResults`. `safeRequest` must take the
  operation name as a parameter rather than deriving it from the message, or those six all fingerprint
  together.
- **`DomainError.context` is populated at far fewer sites than AC 3 implies.** Most `.errors.ts` files
  are bare aliases (`lessonAI.errors.ts` is three lines and passes no context anywhere). Only four
  real call sites pass the 4th constructor argument — `course.service.ts:109-111`, `:477`, `:514`, and
  `enrollment.service.ts:39`. AC 3's test must use one of those as its fixture rather than a
  hypothetical, and the enrichment must be a no-op when `context` is `undefined`.
- **`vercel.service.ts` does not import the logger today.** It is the one server service on raw
  `console.*` throughout, so it is easy to miss in a grep that starts from logger importers.
- **Do not "fix" `lessonAI.service.ts:240` by rethrowing.** The `catch (_error)` swallow is load-bearing
  — the surrounding `finally` exists because the route calls `generator.return()` on abort, and letting
  it throw would take the security event and the retraction down with it. Log the class; keep
  swallowing. Likewise `lessonAI.service.ts:157` is documented as deliberate bookkeeping.
- **courseAI logs the same failure twice** — `withNodeErrors.ts:21` and `app/api/chat/course/route.ts:216`
  both log at error level. AC 1's "exactly once" covers tRPC only; the SSE routes have no equivalent
  guarantee. Drop the node-level log to `debug` or make it a breadcrumb, or courseAI consumes quota at
  2× its failure rate.
- **Registration obligations: none.** This feature constructs no model, defines no tool, and
  interpolates nothing into a prompt, so `GUARDED_ENTRY_POINTS` / `entryPoints.contract.test.ts`,
  `wrappingCoverage`, `unguardedByDesign` and `toolArguments.contract.test.ts` are untouched. Stated
  because "an AI-adjacent feature with no entry-point obligation" is unusual enough that someone will
  check.
- **Setup runs through the Sentry wizard, and then six of its defaults must be reversed.** The project
  is provisioned on Sentry SaaS as org `learnix-fb`, project `javascript-nextjs`. Task 1 of
  `build/plan.md` is:

  ```bash
  npx @sentry/wizard@latest -i nextjs --saas --org learnix-fb --project javascript-nextjs
  ```

  **Prerequisite — the pnpm store, resolved 2026-08-23.** The wizard's first attempt failed with
  `ERR_PNPM_UNEXPECTED_STORE`: `node_modules/.modules.yaml` recorded
  `storeDir: ~/.local/share/pnpm/store/v10`, while `pnpm config get store-dir` returns
  `~/.local/share/pnpm/store/v3` — so pnpm wanted to link from `store/v3/v10` and refused to mix the
  two. **Decision: move to the configured (new) store**, by reinstalling rather than by unsetting the
  config, so the machine keeps one store location across projects:

  ```bash
  pnpm install    # relinks node_modules onto store/v3/v10
  ```

  This is a developer-machine prerequisite, not a repo change: no `package.json` or `pnpm-lock.yaml`
  diff results from it. Any `pnpm add` — including every one the wizard issues — fails until it is
  done, so it is step 0 of Task 1 and worth checking first when the wizard misbehaves on another
  machine.

  The wizard optimises for a demo, not for this spec. Each of these is a **step in Task 1**, not a
  cleanup to remember later — the wizard's output is a starting point that violates six approved
  criteria as written:

  | Wizard default | Required | AC |
  |---|---|---|
  | creates `instrumentation-client.ts`, `NEXT_PUBLIC_SENTRY_DSN` | delete both — v1 is server-only, and *not declaring* the public DSN is the control | 28 |
  | `tracesSampleRate: 1.0` | `0` | 33 |
  | offers session replay / `tunnelRoute` | both off; source scan asserts `tunnelRoute` absent | 34 |
  | `widenClientFileUpload: true` | `false` — it uploads server chunks, exposing `aiGuard/patterns/**` | 35 |
  | adds `/sentry-example-page` + example API route | delete both | — |
  | leaves env vars out of `lib/env.js` | declare `SENTRY_DSN` there; `SENTRY_AUTH_TOKEN` stays build-time only, read in `next.config.ts`, never in `runtimeEnv` | 28, 29 |

  Verify the wizard did not add `deleteSourcemapsAfterUpload: false` or omit it — AC 35 needs it true.
- **Confirm SDK defaults at `/plan` time.** `@sentry/nextjs` is not yet installed, so `linkedErrors`
  depth, `Dedupe` semantics, the default integration list, and sourcemap defaults must be read off the
  version actually installed rather than assumed — AC 14, 24 and 35 each depend on one of them. Pin the
  integration list explicitly rather than relying on defaults (residual S3).
- **Docs that become wrong when this ships** — closing these is the `/qa` Gate Docs step:
  [ADR-010](../../../adr/010-domain-error-mapping.md):113 (the "in the future" line comes true, refined
  by ADR-029); `ai-tutor-guardrails/security.md` S13 §13 (partly closed by AC 36) and its threat-model
  **R8** (scope widens from LangSmith to "LangSmith and Sentry"); `docs/README.md`'s ADR table, stale
  since ADR-020. **Not** [`ai-hardening-plan.md`](../../ai-hardening-plan.md) §5 — its "No custom
  metrics dashboard" non-goal is about *metrics* and stays intact; this adds an error tracker, no
  dashboard.