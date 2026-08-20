# Security — distributed-ai-rate-limiter

**Status:** design (produced at `/spec`, 2026-08-20) · **Tier:** complex ·
**Method:** manual design pass over the drafted spec at `/spec`, with code verification of every
load-bearing claim. The design-mode passes CLAUDE.md §3d requires were **not** run (S8); both agents
ran in **`audit` mode at `/qa`** instead, and what they found is in S7b. Treat S8 as the standing
process debt this feature carries.

Written as requirements, so it can be followed without reading the implementation. Every control
here appears as an acceptance criterion in [`spec.md`](./spec.md) — that is what makes `/plan` unable
to omit it and `/qa` able to check it back.

Prior art: [`../ai-tutor-guardrails/security.md`](../ai-tutor-guardrails/security.md) (S13 §17 is the
residual this feature closes) and
[`../ai-defence-layers/security.md`](../ai-defence-layers/security.md) (S12, the limiter as an
authorization surface).

---

## S1. What this feature defends

The subject is a **storage change to an existing control**, so the asset at risk is not new — it is
the enforceability of a boundary the platform already claims to have.

**Assets**
- **The AI spend budget.** OpenAI calls are billed per token; the limiter is the only ceiling on how
  many a single account can trigger.
- **The price of a brute-force search.** L1 (the input guard) is a detector, not a proof. Its value
  against an adaptive attacker is a function of how many phrasings that attacker can try per minute.
  The limiter *is* that function.
- **The rate-limit decision itself**, which `../ai-defence-layers/security.md` S12 classifies as an
  authorization surface: it decides whether an authenticated caller may act.

**Actors**
- An authenticated user of any role, legitimate but malicious, willing to issue requests **in
  parallel**. This is the actor R3 names, and parallelism is not an exotic capability — it is a `for`
  loop over `fetch`.
- An operator who deploys without the new environment variables. Not an attacker, but the most
  likely cause of the control being absent in production (S6).

**Not in scope**
- Unauthenticated abuse. Every limiter call sits behind a session check, and the middleware throws
  `UNAUTHORIZED` before the limiter is reached.
- Upstream OpenAI 429s. `courseAI/graph/nodeErrors.ts` classifies those as retryable node errors;
  that is inbound provider handling, not this boundary.

## S2. The threat this closes — R3

`../ai-tutor-guardrails/threat-model.md` R3, severity Medium:

> The guarantee is 20 requests per instance per minute, and the attacker controls the instance count
> through parallelism.

The precise defect is that the limiter's guarantee is stated per user but enforced per process. On
Vercel, process count is a function of concurrency, which the caller controls, so the effective
ceiling is `limit × instances` with the attacker choosing the multiplier. A cold start is a second,
free reset.

**Control.** Counters move to a store shared by every instance ([`spec.md`](./spec.md) AC 9). The
control is only proven by a test that uses **two independent store clients against one Redis** — a
test that fails on the memory adapter. A single-client test proves nothing about distribution, and
that is exactly the gap `../ai-defence-layers/build/plan.md` records when it notes that today's
tests "pass either way".

## S3. The threat this also closes — fail-open eviction (`ai-defence-layers` S16 §8)

The memory adapter bounds itself: above `EVICT_THRESHOLD = 5_000` it sweeps expired entries, and if
nothing expired it drops the oldest 10% by insertion order. The source comment is explicit that this
**"Fails OPEN, never closed"** — dropping ~500 live windows hands ~500 users a fresh budget, and it
triggers precisely under the load where the ceiling matters. Recorded as
[`../ai-defence-layers/security.md`](../ai-defence-layers/security.md) S16 §8, "Pressure eviction
fails open, and by a measurable amount"; S16 §6 of the same register carries the per-process residual
that S2 closes.

**Control.** Redis TTLs bound the key space by construction, so the Upstash adapter has no eviction
path and no fail-open branch. The residual survives only on the memory adapter, which after this
feature is a development and test concern rather than a production one.

## S4. New residual — availability

**Fail closed means an Upstash outage disables every AI feature on the platform.** Tutor, course
builder, quiz generation, lesson insights and learning-path regeneration all return
`TOO_MANY_REQUESTS` / 429 until the store recovers.

This is a deliberate trade, taken because the limiter caps real money and prices an attack: a
limiter that fails open under load is not a limiter, since inducing that load is cheap. It is
recorded here rather than discovered in an incident.

**Bounded by** a short per-call timeout ([`spec.md`](./spec.md) AC 13): `STORE_TIMEOUT_MS = 1_000`,
applied through the client's own `signal: () => AbortSignal.timeout(...)`, with `retry: { retries: 0 }`
so a retry cannot multiply that budget on the hot path. Without it an unreachable store does not
merely reject — it holds an SSE route open until the 30 s model timeout, converting a dependency
outage into resource exhaustion on our own side.

**Accepted.** Revisit only with a measured Upstash availability figure, and note that a hedge such as
"fall back to memory when Redis is down" would reopen R3 on demand for any attacker who can degrade
the store.

## S5. New residual — latency and round-trip count

Every limiter check becomes one HTTP round trip. `learningPathAI` performs **two** per request (the
aggregate at the procedure, the scoped window in the service), because the scoped key depends on a
`courseId` that is only trustworthy after the enrollment lookup — a limiter key must never be derived
from request input, so the two checks cannot be merged upward.

**Mitigation:** co-locate the Upstash region with the Vercel region. **Accepted** otherwise; the
alternative is deriving a limiter key from unverified input, which is a worse trade than tens of
milliseconds.

## S6. New residual — silent downgrade, and the control that answers it

If `KV_REST_API_URL` is missing in production, adapter selection falls back to memory and the
platform is back to R3 — while every unit test, every integration test and the
`resourceLimits: APPLIED` row in `conformance/aiSurfaces.ts` still read green. This is the same
defect class ADR-026 was written about: a control that reads as applied and is empty in fact.

**Control:** startup fails when `NODE_ENV === "production"` and the URL is absent
([`spec.md`](./spec.md) AC 17). The env vars are optional in the Zod schema so that CI and local
development need no Redis; the assertion is what makes "optional" safe. Without it, this feature's
most likely real-world failure is that it was never enabled.

## S7. Controls carried forward unchanged

These already hold and must not regress. They are listed because a storage refactor is exactly the
kind of change that quietly drops one.

| Control | Where it lives now | Why it must survive |
|---|---|---|
| The key is `ctx.session.user.id`, never request input | `aiRateLimit.middleware.ts`; `learningPath.ts` passes the *verified* `enrollment.courseId` | A key from input lets a caller choose whose budget to spend |
| Aggregate and feature key spaces are disjoint by construction | `aggregateKey` / `featureKey` | A crafted `scope` must not forge an aggregate key |
| A rejected call increments nothing | `checkAiRateLimit` | Otherwise a user over a feature ceiling also burns their aggregate |
| The limiter is a middleware on a role procedure, never a standalone `aiProcedure` base | `aiRateLimit.middleware.ts`, enforced by `aiLimits.contract.test.ts` | A base silently *replaces* `instructorProcedure` and takes the role check with it |
| The role check runs before the limiter is touched | `aiRateLimit.middleware.integration.test.ts` | An unauthorized caller must not spend a window — now also: must not cost a round trip |
| Rejection messages leak no window, count or reset time | `limiterMessages.contract.test.ts` (AC 47) | Applies to fail-closed rejections too; infra state must not leak either |

The key builders therefore stay in `checkAiRateLimit.ts` and do **not** move behind the store port,
which sees only opaque strings and cannot enforce any of the first three rows.

## S7a. A dropped `await` is a silent bypass — found during implementation

`checkAiRateLimit` now returns a Promise. `if (!promise)` is permanently false, so a call site that
loses its `await` does not fail — the surface simply **stops being rate limited**, quietly.

The severity is that nothing standard catches it. This was measured, not assumed: an `await` was
removed from `app/api/chat/lesson/route.ts` and neither `pnpm typecheck` nor `pnpm check` reported
anything. Tests are equally blind, because `await` over a non-Promise is a no-op — the identical
assertions pass against the sync and async versions.

**Control.** `aiLimits.contract.test.ts` scans every `checkAiRateLimit(` call outside the limiter's
own module and fails unless it is immediately preceded by `await`, with a companion assertion that
the scan finds at least the five known sites so it cannot pass vacuously. Verified by re-running it
against the same deliberate omission and watching it fail. This is the same reasoning as AC 35 and
ADR-026's wrapping scan: where the type system cannot express the invariant, the source text is the
enforcement point.

## S7b. Found at `/qa`, by the audit passes S8 says were skipped at `/spec`

Both agents ran in `audit` mode over the finished branch. Everything here was **fixed**, not
accepted; each is listed because the class matters more than the instance.

1. **The redis tier never ran in CI** (highest-severity finding). `.github/workflows/ci.yml` ran only
   `test:unit` and `test:integration`, and the tier skips itself when the credentials are absent — so
   the distribution test that closes R3, and *all* behavioural coverage of the production adapter,
   reported green by never executing. The Lua script's only CI coverage was two `indexOf` assertions
   and a mocked `eval` returning a canned `1`; a one-character error in the `ARGV[i + 1]` max lookup
   would have passed every gate. Fixed: a `redis` CI job with `redis` + SRH services, plus a guard
   test that fails when `CI` is set and the credentials are not (AC 23). **R3's closure now has
   automated evidence rather than a reviewer's word.**
2. **Two AC 20 assertions had become vacuous.** `expect(__windowSizeForTest()).toBe(0)` read the
   *memory* Map while the limiter under test ran on whichever store `selectStore` picked. With
   `KV_REST_API_*` set — the configuration `.env.test.example` invites — the Map is never written and
   the assertion passed regardless of whether the role check ran first. Fixed by reading through the
   limiter's own store (AC 20). This is the S6 defect class turned inward: a control that reads as
   applied and is empty in fact.
3. **`await` was not the same as *gating*.** The S7a scan required `await` before every call, which a
   bare `await checkAiRateLimit(userId, "lessonAI");` satisfies while leaving the surface completely
   unlimited — and the conformance scan stays green, because it only greps for the identifier. Fixed
   by requiring a gating shape (AC 22). Verified by injecting the bypass: the conformance suite
   passed 13/13, and only the tightened scan caught it.
4. **The production assertion fired at `next build`.** Selecting the store at module load meant a
   credential-less build failed during page-data collection, contradicting AC 16 and `lib/env.js`'s
   own comment. Fixed by deferring selection to first use (AC 16, AC 18). The alternative — keep the
   build failure and amend the docs — was considered and rejected: it gates nothing in CI (which
   never runs `pnpm build`), and its likely outcome is a contributor setting a placeholder URL, which
   fails closed and would 429 every AI request on a deploy that built and started cleanly.
5. **`nodeEnv` could be `undefined`.** Under `SKIP_ENV_VALIDATION` — recommended by `lib/env.js` for
   Docker builds — `.default("development")` does not apply, so a deny-list check would have handed a
   production deploy the memory adapter silently. Fixed with an allowlist (AC 24).
6. **The fail-closed log carried a userId.** Verified live by the auditor: an `UpstashError` embeds
   `command was: [...]`, i.e. the Lua script and the prefixed keys. Fixed to log the error class only
   (AC 25). The token was never at risk — it travels in the `authorization` header, not the body.

**Corrected, and worth recording because the control survived a false rationale:** the spec and
ADR-027 justified banning `Redis.fromEnv()` on the grounds that it reads only `UPSTASH_REDIS_REST_*`.
That is false — it falls back to `KV_REST_API_*` (`node_modules/@upstash/redis/nodejs.mjs:272,278`),
so it would have worked. The ban is still right, for a different reason: the adapter must not source
its own credentials, because `selectStore` is the single decision point and the place the production
assertion lives.

**Not fixed, accepted:** the three raw SSE routes still have no behavioural rate-limit test — no test
drives `POST /api/chat/lesson` to a 429. AC 22's scan plus the middleware integration test cover the
tRPC surfaces and the call shape; the routes' enforcement is proven by source scan only. Recorded
here rather than silently left: the next change to those handlers should add one.

## S8. Method gap

`CLAUDE.md` §3d requires a design-time pass by `security-auditor` (new external service, an
authorization surface) and `llm-security-auditor` (LLM10, unbounded consumption) at `/spec`. This
document was written manually and those agents were **not** dispatched. Run both in `design` mode
against this spec before `/plan`, and fold anything they add into S2–S7 as acceptance criteria.

## S9. Unchanged, still open

- `search.semantic` and `search.recommendations` (`server/api/routers/search.ts`) are
  `studentProcedure` with no limiter, and semantic search is not a member of the `AiFeature` union at
  all — so it is outside this limiter's type domain and cannot simply be added to the table. Both
  call an embedding model. Pre-existing, untouched by this feature, and worth its own spec.

  Two things this feature changes about it. **Relatively it is now worse**: the five `AiFeature`
  surfaces are hard-capped at 30/min/user, which makes an uncapped embedding endpoint the cheapest
  way to burn OpenAI spend on the platform. And **no contract test can currently see it** —
  `aiSurfaces.contract.test.ts` derives model callers from `/new ChatOpenAI\(/`, so
  `OpenAIEmbeddings` is structurally invisible to the completeness scan. It is not an omission the
  matrix could ever have caught. Widen the scan to `/new (ChatOpenAI|OpenAIEmbeddings)\(/` when that
  surface gets its own spec.

- **The divisor moved from instances to accounts, and nothing here prices accounts.** R3's closure
  makes the L1 brute-force budget 30 probes/min *per account* (20 on `lessonAI`, 20 on `courseAI`,
  aggregate binding at 30). What that costs an attacker is now a function of how fast they can create
  accounts, which this feature does not bound. Two things do: `requireEmailVerification` means each
  identity costs a deliverable mailbox, and `role.input: false` means a self-registered account
  cannot reach `courseAI` at all — leaving `lessonAI` at 20/min behind an enrollment. Sign-up
  throttling is classic AppSec and belongs to `security-auditor`; recorded here because it is the
  quantitative successor to R3, not an unrelated auth gap.
- Better Auth sign-in has no throttling. Out of scope here; noted because "the platform rate-limits"
  is the kind of claim that generalises further than the code does.