# ADR-027: Distributed AI Rate Limiting

- **Status**: Accepted
- **Date**: 2026-08-20

## Context

The AI rate limiter (`server/services/_shared/aiLimits/checkAiRateLimit.ts`) keeps its counters in a
`Map` pinned on `globalThis`. The policy it enforces is careful and well-tested: an aggregate budget
of 30/min per user across all AI surfaces, per-feature ceilings, a scoped 1/min per
`(student, course)` rule for learning-path regeneration, keys derived only from the server-side
session, and a check-then-bump that increments nothing on rejection.

None of that is enforced across processes. The deployment target is Vercel, all three AI SSE routes
declare `export const runtime = "nodejs"`, and serverless instance count scales with concurrency. So
the guarantee is per **instance**, and the caller picks the instance count by issuing requests in
parallel; a cold start resets the window for free.

This has been known since the tutor shipped and is filed as risk **R3** (Medium) in
`docs/specs/features/ai-tutor-guardrails/threat-model.md`. ADR-017 §234 already names the remedy —
"For multi-instance deployments, replace with a shared store (Redis)" — and three subsequent
features narrowed the limiter's blast radius while explicitly declining to change this property.

It matters more than a typical missing cap because the limiter is three controls wearing one coat:
the ceiling on OpenAI spend, an authorization surface (`ai-defence-layers/security.md` S12), and the
only thing pricing a brute-force search for a phrasing that gets past the L1 input guard. L1 is a
detector, not a proof; its value against an adaptive attacker is a function of attempts per minute.

## Decision

Move the counters to a shared store, keep the policy exactly where it is, and make the distribution
property a **test** rather than a claim.

1. **A `RateLimitStore` port with two adapters, selected once at module load.** Upstash when
   `KV_REST_API_URL` is set, the existing in-memory `Map` otherwise. Development and CI run
   on memory, so neither acquires a service dependency. Both adapters are driven by one shared
   table-driven suite — the 9 behavioural properties `checkAiRateLimit.test.ts` pins today — because a
   port whose implementations are tested separately is a port whose implementations diverge. (The
   file's other five tests are two source-text scans, two that describe the memory adapter's
   eviction algorithm, and one unrelated to storage; none of them port.)

2. **`@upstash/redis` directly, not `@upstash/ratelimit`.** The purpose-built package is the wrong
   tool for this limiter. Its `limit()` increments as it checks, and this limiter must evaluate the
   aggregate window *and* the feature window before incrementing **either**, so that a per-feature
   rejection does not also burn the user's aggregate budget. Composing two `limit()` calls breaks
   that property, which is not incidental — it is asserted by an existing test and it is what stops a
   user who is already over one ceiling from being pushed over a second.

3. **One Lua script per check.** Redis executes scripts atomically, which is what replaces the
   current guarantee — a source comment noting there is no `await` between `peek` and `bump`, so the
   sequence is atomic within Node's single thread. Two round trips have no such property. The script
   takes N keys and N maxima, returns early if any counter is at its ceiling, and otherwise `INCR`s
   all of them, setting `PEXPIRE` **only on the transition to 1**.

4. **Fixed window, preserved deliberately.** Refreshing the TTL on every increment would convert the
   fixed window into a rolling one and let steady traffic hold a window open indefinitely. The `Map`
   gets this right by storing an absolute `resetAt`; the Lua script has to reproduce it on purpose.

5. **Fail closed.** A store error or timeout rejects. A per-call timeout of ~1 s bounds it, so an
   unreachable store cannot hold an SSE route open until the 30 s model timeout — that would turn a
   dependency outage into resource exhaustion on our own side.

6. **Env vars optional in `lib/env.js`, with a production startup assertion.** Optional keeps Redis
   out of CI and out of a fresh checkout. The assertion — fail at startup when `NODE_ENV` is
   `production` and the URL is absent — is what makes optional safe.

   The names are **`KV_REST_API_URL` and `KV_REST_API_TOKEN`**, because the store was provisioned
   through the Vercel Upstash/KV marketplace integration, which injects those rather than the SDK's
   own `UPSTASH_REDIS_REST_*` defaults. Two consequences follow and are easy to get wrong:
   `Redis.fromEnv()` cannot be used (it reads the SDK names), so the client is constructed
   explicitly; and `KV_REST_API_READ_ONLY_TOKEN` must never be wired in — the limiter's whole job is
   `INCR`, and because the adapter fails closed a read-only token would present as *every AI request
   rate-limited* rather than as an obvious credentials error. The integration also injects `KV_URL`
   and `REDIS_URL`, which are TCP and belong to the `ioredis` option rejected below.

7. **The key builders stay with the policy.** `aggregateKey` / `featureKey` do not move behind the
   store port. The security properties (key derived from the session and never from input; aggregate
   and feature key spaces disjoint by construction) belong next to the policy that depends on them;
   the store sees opaque strings and can enforce none of them.

## Consequences

**R3 closes, and the fail-open eviction residual closes with it** (`ai-defence-layers/security.md`
S16 §8). The memory adapter bounds its
key space by dropping the oldest 10% of live windows above 5 000 entries — a path whose own comment
says it "Fails OPEN, never closed", handing ~500 users a fresh budget exactly under the load where
the ceiling matters. Redis TTLs bound the key space by construction, so the Upstash adapter has no
eviction branch at all.

**The distribution test is the deliverable, not the Redis client.** Every existing limiter test
passes with or without a shared store — `ai-defence-layers/build/plan.md` records this. The test
that matters uses two independent store clients against one Redis and asserts a shared ceiling; it
fails on the memory adapter, which is the point of it. Without that test this ADR is a dependency
upgrade.

**An Upstash outage disables every AI feature.** Direct consequence of fail-closed, accepted because
a limiter that fails open under load is not a limiter — inducing that load is cheap. Recorded as a
residual in `docs/specs/features/distributed-ai-rate-limiter/security.md` S4 rather than left to be
discovered in an incident.

**Latency.** One HTTP round trip per check; `learningPathAI` pays two per request, because its scoped
key depends on a `courseId` that is only trustworthy after the enrollment lookup and a limiter key
must never come from unverified input. Co-locate the Upstash region with the Vercel region.

**`checkAiRateLimit` becomes async**, touching five call sites — the tRPC middleware, three
`app/api/chat/**` route handlers, and `learningPathAI.service.ts`.

**A dropped `await` is silent, and nothing off the shelf catches it.** `if (!promise)` is
permanently false, so the surface simply stops being rate limited. This was checked rather than
assumed: removing one `await` and running `pnpm typecheck` and `pnpm check` produces **no error from
either** — tsc is content to negate a Promise, and Biome has no rule for it here. Tests do not catch
it either, because `await` over a non-Promise is a no-op, so the same assertions pass against the
sync and async versions alike.

So completeness is a **source scan**, for the same reason AC 35 is one: every `checkAiRateLimit(`
call outside its own module must be immediately preceded by `await`
(`aiLimits.contract.test.ts`). The scan is verified non-vacuous by removing an `await` and watching
it fail. The four pre-existing source-scanning contract tests were checked against the added
`await` and need no changes — they match `checkAiRateLimit(` unanchored and `.use(aiRateLimit(` at
router call sites, neither of which this touches.

**The most likely failure mode of this work is that it is never enabled.** A missing production env
var puts the platform back on the per-process Map with the whole suite, and the
`resourceLimits: APPLIED` conformance row, still green. That is why the startup assertion is part of
the decision and not an operational note.

## Alternatives considered

**`@upstash/ratelimit`.** Rejected on the check-then-bump semantics above. It would also replace a
policy that is currently one readable table of constants with a library's window algorithm, and the
per-feature/aggregate/scoped composition is not something it models.

**`ioredis` against a self-managed Redis.** Rejected for the deployment shape, not the software.
Serverless means many short-lived instances each opening TCP connections; connection-pool exhaustion
is the standard failure and the standard fix is a proxy — another moving part. Upstash's REST
transport is stateless HTTP, which is the property that matters here. If Learnix ever moves to
long-lived Node processes, the store port makes this a one-adapter change.

**A Postgres-backed limiter.** Genuinely tempting: no new vendor, no new env vars, real transactions,
and the database is already there. Rejected because it puts a write on the primary database on every
AI request — row churn and vacuum pressure on a table that is pure garbage after 60 seconds, plus
connection-pool contention from serverless with the application's real queries. TTL-based expiry is
free in Redis and a cron job in Postgres.

**Keep per-process and accept R3.** This is the status quo and it was the right call three times,
when the limiter was one control among several being built and the platform was not deployed. It
stops being right at the point of running on Vercel, where the divisor is attacker-chosen.

**Fall back to the memory adapter when Redis is unavailable.** Rejected: it looks like resilience and
is a switch an attacker can flip. Anyone able to degrade the store reopens R3 on demand, and a weak
ceiling that reads as a strong one is the failure mode ADR-026 was written about.