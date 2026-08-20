---
feature: distributed-ai-rate-limiter
status: stable
models: []
depends-on: [ai-defence-layers, ai-tutor-guardrails]
---

## Purpose

The AI rate limiter is the platform's resource boundary (L7). It is three controls at once: the cap
on OpenAI spend per user, an authorization surface
([`../ai-defence-layers/security.md`](../ai-defence-layers/security.md) S12), and the only thing
that **prices** a brute-force search for a phrasing that slips past the L1 input guard.

Its state **was** a `Map` pinned on `globalThis`
(`server/services/_shared/aiLimits/checkAiRateLimit.ts`). On one Node process that is sound. The
deployment target is **Vercel** (`README.md`, `docs/specs/tech-stack.md`) and every AI surface runs
as a serverless function (`export const runtime = "nodejs"` in all three `app/api/chat/**` routes).
So concurrent requests landed on **separate instances, each holding its own Map**, and a cold start
reset the window.

The consequence is written down and has been open since the tutor shipped —
[`../ai-tutor-guardrails/threat-model.md`](../ai-tutor-guardrails/threat-model.md) risk **R3**
(Medium):

> Rate limiter state is a `Map` in process memory: parallel requests reach separate instances each
> with its own counter, and a cold start resets the window. **The guarantee is 20 requests per
> instance per minute, and the attacker controls the instance count through parallelism.**

The attacker chooses the divisor. A caller willing to issue requests in parallel is not meaningfully
limited, which means the spend cap is not a cap and the brute-force price is not a price. Every
subsequent AI feature narrowed the blast radius of this limiter without changing that property, and
each said so explicitly ([`../ai-defence-layers/security.md`](../ai-defence-layers/security.md);
[`../ai-tutor-guardrails/spec.md`](../ai-tutor-guardrails/spec.md) "Out of scope"). This feature
closes R3.

**Scope note.** This feature changes **where the counters live**, not what they count. Every limit,
window and key in the current policy is preserved exactly. It is filed as *complex* tier because it
introduces a new external service, not because the policy is being redesigned.

## Functional scope

**1. The policy stays where it is.** `checkAiRateLimit.ts` keeps `WINDOW_MS = 60_000`,
`AGGREGATE_MAX = 30`, the total `PER_FEATURE_MAX: Record<AiFeature, number>` (so a sixth AI surface
fails to compile rather than inheriting a ceiling), the `Partial` `SCOPED_MAX`
(`learningPathAI: 1`), and the `aggregateKey` / `featureKey` builders.

The key builders in particular do **not** move into the storage layer. The security property is that
a key is derived from the server-side `ctx.session.user.id` and never from request input, and that
the aggregate and per-feature key spaces are disjoint by construction (the character at index
`userId.length` is `" "` for the aggregate and `":"` for a feature key). That invariant belongs next
to the policy that depends on it, not behind a storage port that only sees opaque strings.

**2. A `RateLimitStore` port with two adapters.** `server/services/_shared/aiLimits/store/` holds a
narrow interface — check every supplied window, then increment all of them or none — and two
implementations:

- **Memory** (`memory.store.ts`) — the `globalThis`-pinned `Map`, its `evict()` sweep and
  `EVICT_THRESHOLD`, moved verbatim. This is what local development and the test suite run on, so
  neither gains a service dependency.
- **Upstash** (`upstash.store.ts`) — `@upstash/redis`, one Lua script per check.

The Redis client is a **constructor parameter** on `createUpstashStore`, not a private field reached
through a test seam. `@upstash/redis` auto-pipelines and routes `eval` through a proxy, so assigning
over the method after construction is silently ignored and the "stubbed" call reaches the network.
Injection is the only seam that holds.

The adapter is selected **once at module load**, never per call: Upstash when
`KV_REST_API_URL` is present, memory otherwise.

**3. `checkAiRateLimit` becomes `async`.** It returns `Promise<boolean>`; the name, argument shape
and semantics are unchanged. All five call sites are already in async contexts — the tRPC middleware
(`aiRateLimit.middleware.ts`), the three `app/api/chat/**` route handlers, and
`learningPathAI.service.ts`.

**4. Fail closed.** A store error or timeout is a rejection, not a pass. This inverts the memory
adapter's `evict()` behaviour, which fails open by design, and it is a deliberate trade of
availability for the ceiling — recorded in [`security.md`](./security.md) S4.

**5. Environment.** Two optional vars in `lib/env.js` (`KV_REST_API_URL`,
`KV_REST_API_TOKEN`), plus a **production startup assertion** that fails when the URL is
absent. Optional is what keeps Redis out of CI and out of every contributor's local setup; the
assertion is what stops production from silently falling back to the per-process Map with the whole
test suite still green.

The names come from the **Vercel Upstash/KV marketplace integration**, which is how the store is
provisioned here. It injects five variables; only the REST pair is used:

| Variable | Transport | Used |
|---|---|---|
| `KV_REST_API_URL` | HTTPS REST | **yes** — the client's `url` |
| `KV_REST_API_TOKEN` | — | **yes** — read-write, the client's `token` |
| `KV_REST_API_READ_ONLY_TOKEN` | — | **no** — see below |
| `KV_URL` | `rediss://` TCP | no — the client is HTTP-only |
| `REDIS_URL` | `redis://` TCP | no — same |

Two rules follow. **The adapter never reads the environment itself** — url and token are
parameters. `Redis.fromEnv()` would in fact work (the SDK falls back to `KV_REST_API_URL` /
`KV_REST_API_TOKEN`, `node_modules/@upstash/redis/nodejs.mjs:272,278`), and that is precisely why it
is banned: an adapter that sources its own credentials could connect with values `selectStore` never
saw, so the production assertion in §5 would pass judgement on one thing while the client used
another. One decision point, or the assertion guards nothing.

And **`KV_REST_API_READ_ONLY_TOKEN` is never wired in** — the limiter's every call is an `INCR`, and
because the store fails closed (§4) a read-only token would surface as *every AI request
rate-limited* rather than as a recognisable credentials error.

## Acceptance criteria

Each line is phrased to become a test directly. Rows marked **[BOTH]** must pass against *both*
adapters from one shared table-driven suite — that is what makes the port real rather than nominal.

**Preserved semantics** — `checkAiRateLimit.test.ts` is the contract. Its 14 tests split four ways
and only one group is adapter-portable: **9 behavioural** tests (the [BOTH] rows below), **2
eviction** tests (`AC 42`, "stays bounded under sustained pressure") that describe the memory
adapter's `evict()` algorithm and have no Redis counterpart, **2 source-text scans** that run once
against the file regardless of adapter, and **1** `validateMessageLength` test unrelated to storage.
Only the 9 run against both adapters; the 2 eviction tests stay memory-only and must not be ported.

1. **[BOTH]** Every supplied window is evaluated *before* any of them is incremented, and a rejected
   call increments **none** of them. Today this holds because there is no `await` between `peek` and
   `bump`; under Redis it must be a single Lua script, since two round trips are not atomic.
2. **[BOTH]** One aggregate bucket of `AGGREGATE_MAX = 30` per user is shared across every AI
   surface, including the three raw SSE routes.
3. **[BOTH]** Per-feature ceilings hold: `lessonAI` 20, `courseAI` 20, `quizAI` 10,
   `lessonInsightsAI` 10, `learningPathAI` 10 unscoped.
4. **[BOTH]** `learningPathAI` is limited to 1 regeneration per minute per `(student, course)`, and
   a student enrolled in two courses can regenerate both within one minute — the scoped rule does not
   collapse into the unscoped ceiling.
5. **[BOTH]** `countAggregate: false` spends the feature window only, so `learningPathAI`'s two
   limiter calls in one request consume exactly one aggregate slot.
6. **[BOTH]** Limits are per user: one user exhausting a window does not affect another.
7. **[BOTH]** A hostile `scope` cannot collide with another key space — verified with `" aggregate"`,
   `"a:b:c"` and a 10 000-character scope.
8. A window expires: after `WINDOW_MS` the caller is allowed again. Covered per-adapter
   (`memory.store.test.ts`, `upstash.redis.test.ts`) rather than in the shared suite — the shared
   suite carries the nine properties the original file had, and expiry was not among them.

**Distribution — the criterion that closes R3**

9. Two independently constructed store clients pointing at one Redis share a ceiling: `N` calls
   through client A and `M` through client B reject once `N + M` exceeds the limit. This test
   **fails on the memory adapter**, which is the point of it. Nothing in the current suite covers
   this — `../ai-defence-layers/build/plan.md` records that today's tests "pass either way".
10. Counter keys carry a schema version **and** an environment discriminator, so a Vercel preview
    deployment sharing an Upstash database with production cannot share buckets with it.
11. The window is **fixed**, not sliding: the TTL is set when a counter transitions to 1 and is not
    refreshed on later increments, so a steady stream of requests cannot hold a window open forever.

**Failure behaviour**

12. A store whose call rejects or times out yields `false`. The tRPC middleware turns that into
    `TRPCError{ code: "TOO_MANY_REQUESTS" }` and the raw routes into HTTP 429.
13. A store call is bounded by a short timeout (~1 s) so an unreachable Redis cannot stall an SSE
    route until the 30 s model timeout.
14. The underlying store error is logged server-side and never reaches the caller.
15. Rejection messages still name no window, no remaining count and no reset time, whatever the
    cause — the existing AC 47 assertion in `limiterMessages.contract.test.ts` continues to pass, and
    a fail-closed rejection is indistinguishable to the caller from a genuine limit rejection.

**Wiring and regression**

16. `KV_REST_API_URL` / `KV_REST_API_TOKEN` are declared in `lib/env.js` under both
    `server:` and `runtimeEnv:`, and are **optional**, so `pnpm build`, `pnpm test` and a fresh
    checkout all work without them. This is why store selection is deferred to first use (AC 18):
    `next build` runs with `NODE_ENV=production` and evaluates route modules during page-data
    collection, so selecting at import time made a credential-less build fail.
16a. `KV_REST_API_READ_ONLY_TOKEN` is never **declared or wired** — not in `lib/env.js`, not as a
    key in any `.env` file. The limiter only ever writes, and fail-closed would disguise a read-only
    credential as a rate-limit. Not declaring it is the control. (It is *named* in prohibition
    comments in `.env.example` and `lib/env.js`; a source scan asserts no code references it.)
16b. The Redis client is constructed explicitly from the two values passed into the adapter;
    `Redis.fromEnv()` is not used anywhere, because it reads `UPSTASH_REDIS_REST_*` and would
    silently find nothing under this deployment's variable names.
17. Startup fails with a clear error when `NODE_ENV === "production"` and `KV_REST_API_URL`
    is absent. A missing production env var must not degrade silently to the memory adapter.
18. The adapter is resolved **once, on first use, and memoised** — no call-path branch re-reads the
    environment after that. Deliberately not at module load: see AC 16. On serverless first use *is*
    the cold start, so the production assertion is no less prompt where it matters.
19. The four existing contract tests still pass unchanged in intent: `aiLimits.contract.test.ts`
    (every `.use(aiRateLimit(` sits on a role procedure, `t` stays unexported),
    `limiterMessages.contract.test.ts`, `modelBounds.contract.test.ts`, and
    `conformance/aiSurfaces.contract.test.ts` (every declared tRPC procedure carries `aiRateLimit`;
    every declared raw route calls `checkAiRateLimit`). These scan **source text**, so the added
    `await` must not break their matchers.
20. `aiRateLimit.middleware.integration.test.ts` still shows the role check rejecting *before* the
    limiter is touched — an unauthorized call must not spend a window, and must not cost a Redis
    round trip either.
21. `resourceLimits: APPLIED` in `server/services/_shared/conformance/aiSurfaces.ts` remains accurate
    for all five surfaces.

**Added at `/qa`, from the audit passes**

22. Every `checkAiRateLimit` call site **gates on the verdict**, not merely awaits it. `await
    checkAiRateLimit(userId, "lessonAI");` as a bare statement awaits correctly, satisfies the
    conformance scan's `/checkAiRateLimit\(/`, keeps `resourceLimits: APPLIED` green — and leaves the
    surface completely unlimited. The scan requires `!(await …)`, `const x = await …` or
    `return await …`, and walks `lib/`, `trpc/` and `scripts/` as well as `server/` and `app/`.
23. The Redis tier runs **in CI** against `redis` + `serverless-redis-http` services, and a guard
    test fails when `CI` is set but the credentials are absent. Without it, deleting the job turns
    every distribution test into a silent skip and takes the evidence for R3's closure with it.
24. `selectStore` uses an **allowlist** (`development`, `test`) rather than `nodeEnv !== "production"`.
    `lib/env.js`'s `.default("development")` does not apply under `SKIP_ENV_VALIDATION`, which that
    file recommends for Docker builds, so an unset `NODE_ENV` would otherwise hand a production
    deploy the memory adapter and put `airl:v1:undefined:` in the key namespace.
25. The fail-closed log records the error's **class only**. `@upstash/redis` builds its message as
    `` `${body.error}, command was: ${JSON.stringify(req.body)}` ``, and an `eval` body carries the
    Lua script plus the prefixed keys — which embed the userId, and the courseId on a scoped window.
    Logging the raw error would write an identifiable userId to stdout for every AI request during an
    outage, outside `logSecurityEvent` and under no retention policy.
26. `checkAndBump([])` returns `false`. An empty window list makes the Lua guard loop vacuous and
    would return 1 — a fail-open shape. Unreachable today; the guard is against a future caller.
27. No production file imports `__resetWindowsForTest`, `resetForTest` or `__storeSizeForTest`. On
    the Upstash adapter `resetForTest` is `KEYS` + `DEL` across the environment's whole key space —
    one production call would drop every user's counters.

## Agent notes

- **`PEXPIRE` only on the transition to 1.** Refreshing the TTL on every increment silently converts
  the fixed window into a rolling one, and a caller issuing steady traffic would never see it reset.
  The current `Map` gets this right by storing an absolute `resetAt` at insert; the Lua script has to
  reproduce it deliberately.
- **Atomicity is the whole reason for Lua.** `@upstash/ratelimit` is the obvious dependency and is
  the wrong one here: its `limit()` increments as it checks, so composing an aggregate call with a
  per-feature call would spend the aggregate slot on a per-feature rejection — breaking AC 1, which
  the existing tests pin. See [ADR-027](../../../adr/027-distributed-ai-rate-limiting.md).
- **The `globalThis` pin still matters for the memory adapter.** Next bundles route handlers, the
  tRPC handler and the RSC server separately, so module-scope state fragments *within* one process.
  Do not "simplify" it to a module-level `const` while moving it into the store — every unit test
  would still pass, because they import the module once.
- **The rejection path must not increment.** This is easy to lose when porting to Redis, because the
  natural Redis idiom is `INCR` then compare. It is load-bearing: it stops a user who is already over
  a per-feature ceiling from also burning their aggregate budget.
- **Two limiter calls per `learningPathAI` request** (procedure aggregate + scoped service window)
  means two round trips under Upstash. That is a latency cost, not a correctness one; see
  [`security.md`](./security.md) S5.
- **Docs that become wrong when this ships.** Closing these is part of the `/qa` Gate Docs step, not
  of writing this spec — they are accurate until the code lands:
  `../ai-tutor-guardrails/threat-model.md` (the R3 row, the STRIDE DoS row, the conformance-matrix
  row), `../ai-tutor-guardrails/security.md` S13 §17, `../ai-defence-layers/security.md` S16 §6
  ("the limiter stays per-process") and S16 §8 (the fail-open eviction residual),
  `../ai-tutor-guardrails/spec.md` (two places), and `../ai-input-trust-boundary/spec.md`.
  **Not** `../quiz-answer-key/security.md` — its S13 §17 reference is conditional on the quiz
  cooldown ever being *moved into* the in-process limiter, which this feature does not do; that note
  stays correct as written.
- **Out of scope, still open.** `search.semantic` and `search.recommendations`
  (`server/api/routers/search.ts`) have no limiter at all and are not in the `AiFeature` union. That
  predates this feature and is unchanged by it.