# ADR-029: Enrich at the service boundary, capture once through an allowlist projection

- **Status**: Accepted
- **Date**: 2026-08-24

## Context

[ADR-010](010-domain-error-mapping.md) established `handleServiceError` as the one place a
service-layer `DomainError` becomes a `TRPCError`, and its Consequences section named it "the single
place to add cross-cutting behaviour (Sentry, structured logging) in the future". The
`error-observability` feature is that future arriving, and it found two things that make the line as
written wrong rather than merely incomplete.

**1. `handleServiceError` is not where an error can be captured exactly once.** tRPC is reached by
two independent paths that share no handler: client components go through `fetchRequestHandler`
(`app/api/trpc/[trpc]/route.ts`), server components go through `createCaller` (`trpc/server.ts`).
`handleServiceError` sits on both, but so does a second reporter for the RSC path — `safeRequest`,
which wraps all 34 files in `lib/requests/**`. Capturing in `handleServiceError` would report every
service error twice and spend a 5,000-event free tier at double rate. The only construct on 100% of
procedures on both paths, exactly once, is `timingMiddleware`, because `publicProcedure` and
`protectedProcedure` both chain it and every role procedure builds on those.

**2. `handleServiceError` was copying `error.message` into the `TRPCError` for unmapped throws, and
that message is not always ours.** Three LangChain constructors put untrusted payload text directly
into `Error.message` — `OutputParserException` (the entire model output), `ToolInputParsingException`
(the model-generated tool call), and LangGraph's `InvalidUpdateError` (a courseAI state channel
value). `lessonInsightsAI` does not wrap its chain invokes, so lesson-derived model text was already
reaching the browser. Adding an error tracker on top of that shape would additionally have made the
model's output the Sentry issue title.

A third fact emerged during implementation and belongs here because it is the reason the mechanism
is what it is. `DomainError`'s fourth constructor argument is typed `Record<string, unknown>`, and
33 call sites populate it. They are not all scalar ids: `instructor.service.ts` passes the whole
signup DTO — including the plaintext password — on an unauthenticated `publicProcedure`,
`course.service.ts` passes course DTOs, and `search.service.ts` passes the raw user search string.
Anything a service chooses to put in that bag would otherwise be forwarded verbatim.

## Decision

### 1. Enrich at the service boundary; capture at the tRPC edge

`handleServiceError` attaches `DomainError.context` to the request's Sentry scope and rethrows. It
never captures. `timingMiddleware` performs the one capture, further up the same call stack, where
the tRPC `path` is known and both entry paths converge. ADR-010's "single place" line is **refined,
not contradicted**: it remains the single place cross-cutting error behaviour is attached — the
capture just happens one frame up, because that is the only frame that sees each error once.

The other four capture points — the `logger` reporter, `onRequestError`, `safeRequest`, and the
client error-boundary server action — all call the same `reportError()`, which is idempotent per
error instance via a non-enumerable marker. No module outside `server/observability/reportError.ts`
calls a Sentry capture API; a contract test enforces that boundary.

### 2. What is transmitted is an allowlist projection, never the error object

`server/observability/projectError.ts` constructs a synthetic error chain carrying the class name,
`name` / `code` / `status` / `lc_error_code`, a server-authored static message, and eight allowlisted
scalar context keys (`feature`, `node`, `path`, `op`, `lessonId`, `courseId`, `generationId`,
`userId`). It never reads `message`, at any depth, and it never spreads an object — fields are read
by name, one at a time.

The choice of allowlist over scrubber is the load-bearing one. A denylist has to anticipate every
leaky message format in every dependency, including ones added by a future upgrade. An allowlist does
not. This is the same mechanism, for the same stated reason, as `aiGuard/securityLog.ts`: there is no
field to pass free text into.

The allowlist applies to scope enrichment too, not only to capture. This is not symmetry for its own
sake — it is what makes decision 1 safe, because whatever `handleServiceError` puts on the isolation
scope is merged into the next capture, and the DTOs described above arrive there.

### 3. An unmapped throw yields a fixed message

An error that is neither `TRPCError` nor `DomainError` produces `"An unexpected error occurred"`. The
original is preserved as `cause` for server-side telemetry, where the projection governs what leaves
the process. This closes a live disclosure that existed independently of Sentry.

## Consequences

**Positive**

- One event per failure, on both tRPC paths, with the `path`, the class, and the domain ids attached.
- No model output, prompt, lesson body, chat message, email address, database argument, or DTO can
  reach a third-party processor by way of an error, including through a `cause` chain and including
  from a dependency that has not been written yet.
- A leak that existed before Sentry — raw `Error.message` reaching the browser — is closed.
- Grouping and the per-fingerprint throttle are computed from server-authored values, so the error
  stream's availability is not something a caller can spend.

**Negative / Trade-offs**

- **`error.message` is permanently unavailable from AI paths.** "Why did the tutor fail mid-stream" is
  not answerable from a class name. That detail belongs to LangSmith under
  [ADR-013](013-langsmith-tracing-evals.md)'s division of labour — Sentry owns errors for the whole
  app, LangSmith owns AI traces — and to `ai-observability`'s retention policy.
- A new context key is a deliberate edit to `CONTEXT_KEYS`, not something a caller can add by passing
  a richer object. Callers that pass unlisted keys are silently reduced, which is the intended
  direction but does mean a service can believe it is enriching when it is not.
- `handleServiceError` now has a second reason to exist beyond mapping, so a future refactor that
  "simplifies" it back into the routers would silently remove the domain context from every event.

## Alternatives considered

**Capture in `handleServiceError`, per ADR-010's line as written.** Double-reports every service
error, because `safeRequest` sees the same failure again on the RSC path, and the free tier does not
have room for that. Rejected on quota, not on style.

**Make `onError` in `app/api/trpc/[trpc]/route.ts` unconditional and call it done.** Tempting and
wrong: that handler is reached only by `fetchRequestHandler`. Every RSC call goes through
`createCaller` and would report nothing, and a browser test would look correct.

**A `beforeSend` scrubber instead of a projection.** Requires anticipating each leaky message format
— three in `@langchain/core` alone, plus Prisma's argument-rendering validation errors and
`@upstash/redis`'s command echo. `beforeSend` is kept, but as defence in depth behind the projection,
not as the control.

**Redacting only the top exception frame.** `linkedErrors` walks `cause` five levels deep and turns
each link into its own `exception.values[]` entry, so the raw original would still be transmitted from
underneath a redacted top frame. The projection therefore rebuilds the whole chain.

**Typing `DomainError.context` as the allowlisted shape.** Would push the guarantee into the type
system, but `DomainError` has to accept whatever a service passes, and a cast at the one call site
would restore the hole while looking safe. The runtime allowlist is the control; the type is not.

## References

- `docs/specs/features/error-observability/spec.md` — acceptance criteria, notably AC 2, 3, 10-14, 23
- `docs/specs/features/error-observability/security.md` — design-time threat pass
- `docs/specs/features/error-observability/build/sdk-defaults.md` — SDK behaviours read off the
  installed version rather than assumed
- [ADR-010](010-domain-error-mapping.md) — the mapping this refines
- [ADR-013](013-langsmith-tracing-evals.md) — the Sentry/LangSmith division of labour
