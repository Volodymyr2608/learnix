# Distributed AI Rate Limiter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax. See [`../spec.md`](../spec.md) for the design and Acceptance criteria,
> and [`../security.md`](../security.md) for the residual register.

**Goal:** Move the AI rate limiter's counters out of a per-process `Map` and into a shared store, so
the ceiling holds across Vercel serverless instances (closes risk R3).

**Architecture:** The limiter's *policy* — every limit, window and key — stays in
`checkAiRateLimit.ts` untouched. Only **storage** moves, behind a `RateLimitStore` port with two
adapters: the existing in-memory `Map` (dev, CI) and `@upstash/redis` driving one Lua script (Vercel).
The adapter is chosen once at module load; `checkAiRateLimit` becomes `async`; a store failure is a
rejection, not a pass.

**Tech Stack:** TypeScript, `@upstash/redis` (HTTP/REST client), Redis Lua scripting, Vitest,
`serverless-redis-http` (SRH) for local/CI testing against a real Redis.

**Spec:** [`../spec.md`](../spec.md) · **ADR:** [`../../../adr/027-distributed-ai-rate-limiting.md`](../../../adr/027-distributed-ai-rate-limiting.md)

## Global Constraints

- **`pnpm typecheck` + `pnpm check` must be clean before every commit.** Biome, not ESLint/Prettier.
- **Arrow-function consts** for new helpers and adapters (`docs/constitution.md`, Architecture).
- Unit tests colocated `*.test.ts` (no DB, no network); integration `*.integration.test.ts`.
- **Env vars are declared in `lib/env.js` only** — both the `server:` schema and `runtimeEnv:`.
- **The limiter key is derived from the server-side session, never from request input.** No task may
  move `aggregateKey` / `featureKey` behind the store port.
- **A rejected call increments nothing.** This is the single easiest property to lose in the port.
- The exact rejection message `"Too many AI requests — please try again shortly."` must not change
  (asserted in `aiRateLimit.middleware.integration.test.ts`).

---

## Codebase anchors (verified during planning)

- `checkAiRateLimit(userId, feature, opts?): boolean` (`server/services/_shared/aiLimits/checkAiRateLimit.ts:116-143`)
  — the sync function to make async. Policy constants at `:11-43`, key builders at `:65-67`,
  `evict()` at `:69-90`, `peek`/`bump` at `:92-101`, test helpers at `:149-157`.
- `globalThis` pin (`checkAiRateLimit.ts:54-58`) — must survive verbatim in the memory adapter. Next
  bundles route handlers, the tRPC handler and the RSC server separately, so a module-scope `const`
  fragments *within* one process and every unit test still passes.
- `aiRateLimit` middleware (`server/services/_shared/aiLimits/aiRateLimit.middleware.ts:22-35`) —
  currently a **sync** callback.
- `timingMiddleware` (`server/api/trpc.ts:97-112`) — the existing precedent that
  `t.middleware(async (…) => {…})` works here. `createTRPCMiddleware = t.middleware` at `:89`.
- Raw route call sites: `app/api/chat/lesson/route.ts:26`, `app/api/chat/course/route.ts:36`,
  `app/api/chat/learning-path/route.ts:19` — all inside `export async function POST`.
- `checkRateLimit(studentId, courseId): void` (`server/services/learningPathAI/learningPathAI.service.ts:27-41`),
  called at `:89` (`regenerate`) and `:117` (`streamRegenerate`, an `async *` generator).
- **Contract scans are safe against `await`** — verified: `aiSurfaces.contract.test.ts:80` matches
  `/checkAiRateLimit\(/` (substring, unanchored); `aiLimits.contract.test.ts:105,123` match
  `/\.use\(aiRateLimit\(/` at *router* call sites, which this change never touches. No contract test
  needs editing.
- `checkAiRateLimit.test.ts` — **14 tests**: 2 source-text scans (`:20`, `:29`), **9 behavioural**
  (`:38,50,60,70,82,94,113,131,148`), 2 memory-only eviction (`:160`, `:178`), 1 unrelated (`:190`).
  Only the 9 port to both adapters.
- `db.ts:10-16` — the lazy-factory + `NODE_ENV !== "production"` re-pin pattern for an external
  client singleton.
- `vitest.config.ts:10-32` — two projects, `unit` and `integration`. No third tier exists yet.
- `test/loadEnv.ts:6` — sets `SKIP_ENV_VALIDATION=true` for **every** test. This is why the
  production assertion cannot live in a `lib/env.js` `superRefine`: it would never run in tests, and
  on Vercel it would only fire at build time, not at the cold start that actually matters.
- `tracing.ts:17-22` (`if (!env.LANGSMITH_TRACING) return fn;`) — the optional-env-var precedent.
- `@upstash/redis` API (verified via Context7, `/upstash/docs`):
  `redis.eval(script, keys[], args[])`; `new Redis({ url, token, signal: () => AbortSignal.timeout(ms), retry: { retries } })`;
  a timeout throws `TimeoutError`.
- **`Redis.fromEnv()` must NOT be used** — but not because it would fail. It reads
  `UPSTASH_REDIS_REST_*` and *falls back to* `KV_REST_API_URL` / `KV_REST_API_TOKEN`
  (`node_modules/@upstash/redis/nodejs.mjs:272,278`), so it would work. It is banned because the
  adapter must not source its own credentials: `selectStore` is the single decision point and the
  place the production assertion lives. Always construct explicitly with `new Redis({ url, token })`
  from the values passed into `createUpstashStore`.
- **The five variables Vercel injects, and which to use** (present but commented out in `.env.local`):
  | Variable | Transport | Use it? |
  |---|---|---|
  | `KV_REST_API_URL` | HTTPS REST | **Yes** — this is the client's `url` |
  | `KV_REST_API_TOKEN` | — | **Yes** — read-write, this is the client's `token` |
  | `KV_REST_API_READ_ONLY_TOKEN` | — | **No.** The limiter runs `INCR`/`PEXPIRE`; a read-only token fails every write and, because the adapter fails closed, would silently 429 every AI request |
  | `KV_URL` | `rediss://` TCP | No — `@upstash/redis` is HTTP-only |
  | `REDIS_URL` | `redis://` TCP | No — same; only relevant to the `ioredis` option ADR-027 rejected |

**Per-task conventions:** after the implementation step, `pnpm typecheck` and `pnpm check` must be
clean before committing. Each task ends green unless it explicitly says otherwise.

---

## Task 1: The `RateLimitStore` port and the memory adapter

Pure addition — nothing imports these yet, so the build stays green.

**Files:**
- Create: `server/services/_shared/aiLimits/store/types.ts`
- Create: `server/services/_shared/aiLimits/store/memory.store.ts`
- Test: `server/services/_shared/aiLimits/store/memory.store.test.ts`

**Interfaces:**
- Produces: `type LimitWindow = { key: string; max: number }`;
  `type RateLimitStore = { checkAndBump(windows, windowMs): Promise<boolean>; countForTest(key): Promise<number>; resetForTest(): Promise<void> }`;
  `memoryStore: RateLimitStore`; `EVICT_THRESHOLD: number`; `__windowSizeForTest(): number`.

- [ ] **Step 1: Write the failing test**

```ts
// server/services/_shared/aiLimits/store/memory.store.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import {
	__windowSizeForTest,
	EVICT_THRESHOLD,
	memoryStore,
} from "./memory.store";

const WINDOW_MS = 60_000;

describe("memoryStore", () => {
	beforeEach(() => memoryStore.resetForTest());

	it("allows up to max then rejects", async () => {
		for (let i = 0; i < 3; i++) {
			expect(await memoryStore.checkAndBump([{ key: "k", max: 3 }], WINDOW_MS)).toBe(true);
		}

		expect(await memoryStore.checkAndBump([{ key: "k", max: 3 }], WINDOW_MS)).toBe(false);
	});

	it("increments nothing when any window is already at its ceiling", async () => {
		await memoryStore.checkAndBump([{ key: "full", max: 1 }], WINDOW_MS);

		expect(
			await memoryStore.checkAndBump(
				[
					{ key: "full", max: 1 },
					{ key: "fresh", max: 10 },
				],
				WINDOW_MS,
			),
		).toBe(false);
		// The rejection must not have spent the second window.
		expect(await memoryStore.countForTest("fresh")).toBe(0);
	});

	it("checks every window before incrementing any", async () => {
		// "second" is the one at its ceiling; "first" must be left alone.
		await memoryStore.checkAndBump([{ key: "second", max: 1 }], WINDOW_MS);

		await memoryStore.checkAndBump(
			[
				{ key: "first", max: 10 },
				{ key: "second", max: 1 },
			],
			WINDOW_MS,
		);

		expect(await memoryStore.countForTest("first")).toBe(0);
	});

	it("evicts under pressure rather than growing without bound", async () => {
		for (let i = 0; i < EVICT_THRESHOLD * 2; i++) {
			await memoryStore.checkAndBump([{ key: `k-${i}`, max: 10 }], WINDOW_MS);
		}

		expect(__windowSizeForTest()).toBeLessThanOrEqual(EVICT_THRESHOLD + 2);
	});
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm vitest run --project unit server/services/_shared/aiLimits/store/memory.store.test.ts`
Expected: FAIL — `Failed to resolve import "./memory.store"`.

- [ ] **Step 3: Implement**

```ts
// server/services/_shared/aiLimits/store/types.ts

/** One counter window: an opaque key and the ceiling that applies to it. */
export type LimitWindow = { key: string; max: number };

/**
 * The storage boundary for the AI rate limiter. It sees opaque keys and never
 * builds them: the "key is derived from the session, never from request input"
 * invariant lives with the policy in checkAiRateLimit.ts, which is the only
 * place that can enforce it.
 */
export type RateLimitStore = {
	/**
	 * Evaluate EVERY window, then increment ALL of them or NONE. Returns whether
	 * the call is allowed. A rejection must leave every counter untouched.
	 */
	checkAndBump(
		windows: readonly LimitWindow[],
		windowMs: number,
	): Promise<boolean>;
	/** Test-only. Current count for a key; 0 when absent or expired. */
	countForTest(key: string): Promise<number>;
	/** Test-only. Drop all state. */
	resetForTest(): Promise<void>;
};
```

```ts
// server/services/_shared/aiLimits/store/memory.store.ts
import type { LimitWindow, RateLimitStore } from "./types";

/**
 * Memory-adapter-only. Redis bounds its key space with TTLs and has no
 * equivalent code path, which is why this constant lives here and not with the
 * policy.
 */
export const EVICT_THRESHOLD = 5_000;

type Entry = { count: number; resetAt: number };

/**
 * Pinned on globalThis, not module scope. Next bundles route handlers, the tRPC
 * handler and the RSC server separately, so module-scope state is per bundle
 * instance: "one aggregate bucket" would silently become two or three inside a
 * single process, and every unit test would still pass because they import the
 * module once. Same pattern as server/db.ts.
 */
const globalForLimits = globalThis as unknown as {
	aiRateWindows?: Map<string, Entry>;
};
const windows = globalForLimits.aiRateWindows ?? new Map<string, Entry>();
globalForLimits.aiRateWindows = windows;

const evict = (now: number): void => {
	if (windows.size <= EVICT_THRESHOLD) return;

	const before = windows.size;
	for (const [key, entry] of windows) {
		if (now >= entry.resetAt) windows.delete(key);
	}
	if (windows.size < before) return;

	// Nothing expired — a burst of live keys. Dropping the oldest 10% by INSERTION
	// order resets ~500 windows at once, i.e. a fresh budget for ~500 users, and it
	// fires exactly under the load where the ceiling matters. Fails OPEN, never
	// closed. Reaching it needs ~170+ concurrently active users at full rate; a
	// single account cannot steer it, because a rejected call never increments.
	const surplus = Math.ceil(windows.size * 0.1);
	let dropped = 0;
	for (const key of windows.keys()) {
		windows.delete(key);
		if (++dropped >= surplus) break;
	}
};

const peek = (key: string, now: number): Entry | undefined => {
	const entry = windows.get(key);
	return !entry || now >= entry.resetAt ? undefined : entry;
};

const bump = (key: string, now: number, windowMs: number): void => {
	const entry = peek(key, now);
	if (!entry) windows.set(key, { count: 1, resetAt: now + windowMs });
	else entry.count++;
};

export const memoryStore: RateLimitStore = {
	checkAndBump: async (
		list: readonly LimitWindow[],
		windowMs: number,
	): Promise<boolean> => {
		const now = Date.now();
		evict(now);

		// Every window is evaluated BEFORE any is incremented. There is no await
		// between the two loops, so this stays atomic within Node's single thread.
		for (const window of list) {
			if ((peek(window.key, now)?.count ?? 0) >= window.max) return false;
		}
		for (const window of list) bump(window.key, now, windowMs);

		return true;
	},

	countForTest: async (key: string): Promise<number> =>
		peek(key, Date.now())?.count ?? 0,

	resetForTest: async (): Promise<void> => windows.clear(),
};

/** Memory-adapter-only: the eviction tests assert on total key count. */
export const __windowSizeForTest = (): number => windows.size;
```

- [ ] **Step 4: Run it, expect PASS** — then `pnpm typecheck` && `pnpm check`.

Run: `pnpm vitest run --project unit server/services/_shared/aiLimits/store/memory.store.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/services/_shared/aiLimits/store
git commit -m "feat(aiLimits): add RateLimitStore port and in-memory adapter"
```

---

## Task 2: Rewire `checkAiRateLimit` onto the store and make it async

The breaking task. Every call site moves in the same commit, so the build ends green.

**Files:**
- Modify: `server/services/_shared/aiLimits/checkAiRateLimit.ts` (replace `:45-101` storage internals and `:116-157`)
- Modify: `server/services/_shared/aiLimits/index.ts`
- Modify: `server/services/_shared/aiLimits/aiRateLimit.middleware.ts:22-35`
- Modify: `app/api/chat/lesson/route.ts:26`, `app/api/chat/course/route.ts:36`, `app/api/chat/learning-path/route.ts:19`
- Modify: `server/services/learningPathAI/learningPathAI.service.ts:27,89,117`
- Modify: `server/services/_shared/aiLimits/checkAiRateLimit.test.ts`
- Modify: `server/api/routers/aiRateLimit.middleware.integration.test.ts`

**Interfaces:**
- Consumes: `memoryStore`, `RateLimitStore`, `LimitWindow`, `EVICT_THRESHOLD`, `__windowSizeForTest` (Task 1).
- Produces: `checkAiRateLimit(userId, feature, opts?): Promise<boolean>`;
  `createRateLimiter(store: RateLimitStore)` returning
  `{ checkAiRateLimit, aggregateCountForTest, featureCountForTest, resetForTest }`;
  async `__resetWindowsForTest` / `__aggregateCountForTest` / `__featureCountForTest`.

- [ ] **Step 1: Make the existing tests express the new async contract**

Edit `checkAiRateLimit.test.ts`. The 2 source-text tests (`:20`, `:29`) are unchanged. Make the
`beforeEach` and the 9 behavioural tests await, and re-point the 2 eviction tests at the memory
store. Replace the import block and `beforeEach` with:

```ts
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import {
	__aggregateCountForTest,
	__featureCountForTest,
	__resetWindowsForTest,
	AGGREGATE_MAX,
	checkAiRateLimit,
	MAX_MSG_LENGTH,
	validateMessageLength,
} from "./checkAiRateLimit";
import { __windowSizeForTest, EVICT_THRESHOLD } from "./store/memory.store";

const FILE = "server/services/_shared/aiLimits/checkAiRateLimit.ts";

describe("checkAiRateLimit", () => {
	beforeEach(async () => {
		await __resetWindowsForTest();
	});
```

Then make every behavioural body async. Two representative rewrites — apply the same shape to all 9:

```ts
	it("shares one aggregate bucket across features (AC 39)", async () => {
		let allowed = 0;
		for (let i = 0; i < 100; i++) {
			// 20 + 20 > 30, so the aggregate is what stops this, not either ceiling.
			const feature = i % 2 === 0 ? "courseAI" : "lessonAI";
			if (await checkAiRateLimit("u1", feature)) allowed++;
			else break;
		}

		expect(allowed).toBe(AGGREGATE_MAX);
	});

	it("a request rejected by the aggregate leaves the per-feature counter alone (AC 41)", async () => {
		// Exhaust the AGGREGATE with MIXED features: 20 courseAI alone hits the
		// per-feature ceiling at 20 and stops bumping, so the aggregate would never
		// reach 30 and the assertion below would fail for the wrong reason.
		for (let i = 0; i < 15; i++) await checkAiRateLimit("u1", "courseAI");
		for (let i = 0; i < 15; i++) await checkAiRateLimit("u1", "lessonAI");

		const before = await __featureCountForTest("u1", "quizAI");
		expect(await checkAiRateLimit("u1", "quizAI")).toBe(false);
		expect(await __featureCountForTest("u1", "quizAI")).toBe(before);
	});
```

The two eviction tests keep `__windowSizeForTest` / `EVICT_THRESHOLD` (now imported from
`./store/memory.store`) and gain `await` on each `checkAiRateLimit` call.

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm vitest run --project unit server/services/_shared/aiLimits/checkAiRateLimit.test.ts`
Expected: FAIL — `EVICT_THRESHOLD` is no longer exported from `./checkAiRateLimit`, and awaited
booleans resolve against a sync function so the ceiling assertions come out wrong.

- [ ] **Step 3: Implement**

Replace everything in `checkAiRateLimit.ts` from `type Entry` (`:45`) through the end of the file
with the following. `WINDOW_MS`, `PER_FEATURE_MAX`, `SCOPED_MAX`, `AGGREGATE_MAX` and the
`AiRateLimitFeature` alias above line 45 stay **exactly as they are** — the source-text contract
tests assert on them.

```ts
import { rateLimitStore } from "./store";
import type { LimitWindow, RateLimitStore } from "./store/types";

/**
 * Key spaces are disjoint because the character at index userId.length is ":"
 * for every feature key and " " for the aggregate, and userId is server-derived.
 * NOT because "no key contains a space" — `scope` can contain anything.
 *
 * These stay here, with the policy, and are never passed to the store: the store
 * sees opaque strings and cannot enforce "derived from the session, never from
 * request input".
 */
const aggregateKey = (userId: string) => `${userId} aggregate`;
const featureKey = (userId: string, feature: string, scope?: string) =>
	scope ? `${userId}:${feature}:${scope}` : `${userId}:${feature}`;

/**
 * Bound to a store rather than reading a module-level one, so the behavioural
 * contract suite can run the identical assertions against both adapters. The
 * production instance below is bound once, at module load.
 */
export const createRateLimiter = (store: RateLimitStore) => {
	/**
	 * One aggregate bucket per user, shared by the raw app/api/chat routes and
	 * every tRPC AI procedure. Living here rather than in the tRPC middleware is
	 * the point: a middleware-side aggregate would leave the three SSE routes on a
	 * separate budget.
	 *
	 * Both windows are handed to the store together because it must evaluate both
	 * before incrementing either — a rejected call spends nothing.
	 *
	 * `countAggregate: false` is for the SECOND limiter call inside one request
	 * (learningPathAI checks an aggregate at the procedure and a scoped window in
	 * the service). Without it one user request would spend two of AGGREGATE_MAX.
	 */
	const check = (
		userId: string,
		feature: AiRateLimitFeature,
		opts?: { scope?: string; countAggregate?: boolean },
	): Promise<boolean> => {
		const countAggregate = opts?.countAggregate !== false;
		// PER_FEATURE_MAX is total over AiFeature, so a sixth surface fails to
		// compile rather than silently inheriting a ceiling. SCOPED_MAX is partial by
		// design: only a feature with a per-scope contract appears there.
		const max = opts?.scope
			? (SCOPED_MAX[feature] ?? PER_FEATURE_MAX[feature])
			: PER_FEATURE_MAX[feature];

		// Aggregate first: it is the window that rejects first today, and the store
		// returns on the first window at its ceiling.
		const windows: LimitWindow[] = [];
		if (countAggregate) {
			windows.push({ key: aggregateKey(userId), max: AGGREGATE_MAX });
		}
		windows.push({ key: featureKey(userId, feature, opts?.scope), max });

		return store.checkAndBump(windows, WINDOW_MS);
	};

	return {
		checkAiRateLimit: check,
		aggregateCountForTest: (userId: string) =>
			store.countForTest(aggregateKey(userId)),
		featureCountForTest: (userId: string, feature: string, scope?: string) =>
			store.countForTest(featureKey(userId, feature, scope)),
		resetForTest: () => store.resetForTest(),
	};
};

const limiter = createRateLimiter(rateLimitStore);

export const checkAiRateLimit = limiter.checkAiRateLimit;

export const MAX_MSG_LENGTH = 2000;
export const validateMessageLength = (m: string): boolean =>
	m.length <= MAX_MSG_LENGTH;

export const __resetWindowsForTest = limiter.resetForTest;
export const __aggregateCountForTest = limiter.aggregateCountForTest;
export const __featureCountForTest = limiter.featureCountForTest;
```

Add the temporary store barrel so this compiles (Task 6 replaces its body with real selection):

```ts
// server/services/_shared/aiLimits/store/index.ts
import { memoryStore } from "./memory.store";
import type { RateLimitStore } from "./types";

export const rateLimitStore: RateLimitStore = memoryStore;
```

Drop `EVICT_THRESHOLD` from the barrel — it is memory-adapter-specific now:

```ts
// server/services/_shared/aiLimits/index.ts — replace the export block
export {
	AGGREGATE_MAX,
	type AiRateLimitFeature,
	checkAiRateLimit,
	createRateLimiter,
	MAX_MSG_LENGTH,
	validateMessageLength,
} from "./checkAiRateLimit";
```

Middleware — an async callback, matching `timingMiddleware`'s shape:

```ts
// server/services/_shared/aiLimits/aiRateLimit.middleware.ts:22-35
export const aiRateLimit = (feature: AiRateLimitFeature) =>
	createTRPCMiddleware(async ({ ctx, next }) => {
		const userId = ctx.session?.user?.id;
		if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

		if (!(await checkAiRateLimit(userId, feature))) {
			throw new TRPCError({
				code: "TOO_MANY_REQUESTS",
				message: "Too many AI requests — please try again shortly.",
			});
		}

		return next();
	});
```

The three raw routes — same edit in each, only the feature name differs:

```ts
// app/api/chat/lesson/route.ts:26
	if (!(await checkAiRateLimit(session.user.id, "lessonAI"))) {
		return new Response("Too Many Requests", { status: 429 });
	}
```
```ts
// app/api/chat/course/route.ts:36
	if (!(await checkAiRateLimit(session.user.id, "courseAI"))) {
		return new Response("Too Many Requests", { status: 429 });
	}
```
```ts
// app/api/chat/learning-path/route.ts:19
	if (!(await checkAiRateLimit(session.user.id, "learningPathAI"))) {
		return new Response("Too Many Requests", { status: 429 });
	}
```

The service — `checkRateLimit` becomes async; both callers await it. `streamRegenerate` is an
`async *` generator, so `await` is valid there:

```ts
// server/services/learningPathAI/learningPathAI.service.ts:27
async function checkRateLimit(
	studentId: string,
	courseId: string,
): Promise<void> {
	const allowed = await checkAiRateLimit(studentId, "learningPathAI", {
		scope: courseId,
		countAggregate: false,
	});
	if (!allowed) {
		throw new LearningPathRateLimitedError(
			// Fixed, and deliberately vague about the window: a message naming the
			// rate ("once per minute") or a remaining count hands a caller the shape
			// of the limiter for free (AC 47).
			"Please wait a moment before regenerating your learning path",
			"TOO_MANY_REQUESTS",
		);
	}
}
```
```ts
// :89 (regenerate) and :117 (streamRegenerate) — both become:
		await checkRateLimit(studentId, courseId);
```

Finally, `aiRateLimit.middleware.integration.test.ts` — its `beforeEach` and assertions use the now-async
helpers:

```ts
	beforeEach(async () => {
		await truncateAll();
		await __resetWindowsForTest();
	});
```
and every `__featureCountForTest(...)` / `__windowSizeForTest()` assertion in that file becomes
`await expect(__featureCountForTest(...)).resolves.toBe(...)`. `__windowSizeForTest` is imported from
`@/server/services/_shared/aiLimits/store/memory.store` and stays synchronous.

- [ ] **Step 4: Run the full suite, expect PASS**

Run: `pnpm typecheck && pnpm check && pnpm test:unit`
Expected: PASS. `pnpm typecheck` is the real gate here — it flags any call site where the `await`
was missed, because `Promise<boolean>` is always truthy and `if (!promise)` would silently never
reject.

Run: `pnpm test:integration`
Expected: PASS, including `aiRateLimit.middleware.integration.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(aiLimits): move counters behind RateLimitStore, make checkAiRateLimit async"
```

---

## Task 3: One behavioural contract suite, parameterised by store

Extract the 9 behavioural tests into a suite any adapter can be run through. Against memory only for
now; Task 7 points it at Redis.

**Files:**
- Create: `server/services/_shared/aiLimits/store/storeContract.ts`
- Modify: `server/services/_shared/aiLimits/checkAiRateLimit.test.ts`

**Interfaces:**
- Consumes: `createRateLimiter` (Task 2), `RateLimitStore` (Task 1).
- Produces: `describeRateLimiterContract(label: string, store: RateLimitStore): void`.

- [ ] **Step 1: Write the shared suite**

```ts
// server/services/_shared/aiLimits/store/storeContract.ts
import { beforeEach, describe, expect, it } from "vitest";
import { AGGREGATE_MAX, createRateLimiter } from "../checkAiRateLimit";
import type { RateLimitStore } from "./types";

/**
 * The nine behavioural properties of the limiter, run against ANY store. The
 * eviction tests are deliberately absent: they describe the memory adapter's
 * evict() algorithm, which Redis replaces with TTLs and has no counterpart for.
 *
 * A port whose adapters are tested separately is a port whose adapters diverge —
 * this file is what stops the Lua script from merely approximating the Map.
 */
export const describeRateLimiterContract = (
	label: string,
	store: RateLimitStore,
): void => {
	describe(`rate limiter contract — ${label}`, () => {
		const {
			checkAiRateLimit,
			aggregateCountForTest,
			featureCountForTest,
			resetForTest,
		} = createRateLimiter(store);

		beforeEach(async () => {
			await resetForTest();
		});

		it("shares one aggregate bucket across features (AC 39)", async () => {
			let allowed = 0;
			for (let i = 0; i < 100; i++) {
				// 20 + 20 > 30, so the aggregate is what stops this, not either ceiling.
				const feature = i % 2 === 0 ? "courseAI" : "lessonAI";
				if (await checkAiRateLimit("u1", feature)) allowed++;
				else break;
			}

			expect(allowed).toBe(AGGREGATE_MAX);
		});

		it("keeps each user's budget separate", async () => {
			// Mixed features, because 30 courseAI calls stop bumping the aggregate at
			// its own ceiling of 20 and the aggregate would never fill.
			for (let i = 0; i < 15; i++) await checkAiRateLimit("u1", "courseAI");
			for (let i = 0; i < 15; i++) await checkAiRateLimit("u1", "lessonAI");

			expect(await checkAiRateLimit("u1", "quizAI")).toBe(false);
			expect(await checkAiRateLimit("u2", "quizAI")).toBe(true);
		});

		it("enforces the per-feature ceiling below the aggregate", async () => {
			let allowed = 0;
			for (let i = 0; i < 30; i++) {
				if (await checkAiRateLimit("u1", "quizAI")) allowed++;
				else break;
			}

			expect(allowed).toBe(10);
		});

		it("a request rejected by the aggregate leaves the per-feature counter alone (AC 41)", async () => {
			for (let i = 0; i < 15; i++) await checkAiRateLimit("u1", "courseAI");
			for (let i = 0; i < 15; i++) await checkAiRateLimit("u1", "lessonAI");

			const before = await featureCountForTest("u1", "quizAI");
			expect(await checkAiRateLimit("u1", "quizAI")).toBe(false);
			expect(await featureCountForTest("u1", "quizAI")).toBe(before);
		});

		it("countAggregate: false does not spend a second aggregate slot", async () => {
			await checkAiRateLimit("u1", "learningPathAI");
			const agg = await aggregateCountForTest("u1");

			await checkAiRateLimit("u1", "learningPathAI", {
				scope: "c1",
				countAggregate: false,
			});

			expect(await aggregateCountForTest("u1")).toBe(agg);
		});

		it("a hostile scope cannot collide with the aggregate key (AC 40)", async () => {
			// The invariant is the separator at index userId.length — ":" for a
			// feature key, " " for the aggregate — not the absence of spaces in scope.
			await checkAiRateLimit("u1", "courseAI");
			const aggregate = await aggregateCountForTest("u1");

			for (const scope of [" aggregate", "a:b:c", "x".repeat(10_000)]) {
				await checkAiRateLimit("u1", "learningPathAI", {
					scope,
					countAggregate: false,
				});
				expect(await aggregateCountForTest("u1"), scope).toBe(aggregate);
			}

			expect(await featureCountForTest("u1", "", " aggregate")).toBe(0);
		});

		it("enforces ONE regeneration per minute per (student, course) (AC 43)", async () => {
			expect(
				await checkAiRateLimit("u1", "learningPathAI", {
					scope: "c1",
					countAggregate: false,
				}),
			).toBe(true);
			expect(
				await checkAiRateLimit("u1", "learningPathAI", {
					scope: "c1",
					countAggregate: false,
				}),
			).toBe(false);
		});

		it("keeps that window per course, not per student (AC 43)", async () => {
			await checkAiRateLimit("u1", "learningPathAI", {
				scope: "c1",
				countAggregate: false,
			});

			expect(
				await checkAiRateLimit("u1", "learningPathAI", {
					scope: "c2",
					countAggregate: false,
				}),
			).toBe(true);
			expect(await featureCountForTest("u1", "learningPathAI", "c1")).toBe(1);
			expect(await featureCountForTest("u1", "learningPathAI", "c2")).toBe(1);
		});

		it("leaves the unscoped ceiling alone, so the scoped rule cannot collapse it", async () => {
			// A per-feature ceiling of 1 would have made this 1/min across ALL of a
			// student's courses, which is the mistake the scoped table exists to avoid.
			let allowed = 0;
			for (let i = 0; i < 12; i++) {
				if (await checkAiRateLimit("u1", "learningPathAI")) allowed++;
				else break;
			}

			expect(allowed).toBe(10);
		});
	});
};
```

- [ ] **Step 2: Point the existing test file at it**

In `checkAiRateLimit.test.ts`, delete the 9 behavioural `it(...)` blocks and call the shared suite
instead. Keep the 2 source-text scans, the 2 eviction tests and the `validateMessageLength` block:

```ts
import { memoryStore } from "./store/memory.store";
import { describeRateLimiterContract } from "./store/storeContract";

describeRateLimiterContract("memory", memoryStore);
```

- [ ] **Step 3: Run, expect PASS**

Run: `pnpm vitest run --project unit server/services/_shared/aiLimits/`
Expected: PASS — 9 contract tests under "rate limiter contract — memory", plus the 2 scans, 2
eviction tests, 1 length test, and Task 1's 4 store tests.

- [ ] **Step 4: Verify the suite is not vacuous**

Temporarily change `AGGREGATE_MAX` to `31` in `checkAiRateLimit.ts`, re-run, and confirm
"shares one aggregate bucket" FAILS. Revert.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test(aiLimits): extract the behavioural limiter contract into a store-parameterised suite"
```

---

## Task 4: Env vars, dependency, and the Upstash adapter

**Files:**
- Modify: `package.json` (add `@upstash/redis`)
- Modify: `lib/env.js` (`server:` and `runtimeEnv:` blocks)
- Modify: `.env.example`, `.env.test.example`
- Create: `server/services/_shared/aiLimits/store/upstash.store.ts`
- Test: `server/services/_shared/aiLimits/store/upstash.store.test.ts`

**Interfaces:**
- Produces: `createUpstashStore(url: string, token: string): RateLimitStore`;
  `CHECK_AND_BUMP_SCRIPT: string`; `STORE_TIMEOUT_MS: number`; `keyPrefix(): string`.

- [ ] **Step 1: Install the dependency**

```bash
pnpm add @upstash/redis
```

- [ ] **Step 2: Declare the env vars**

In `lib/env.js`, add to the `server:` object (after `STRIPE_PLATFORM_FEE_PERCENT`):

```js
		// Optional so `next build`, CI and a fresh checkout work without Redis; the
		// limiter falls back to its in-memory adapter. Production absence is caught
		// by an assertion at store selection, NOT here — test/loadEnv.ts sets
		// SKIP_ENV_VALIDATION for every test, so a refine here would never run in
		// tests, and on Vercel it would fire at build time rather than at the cold
		// start that actually matters.
		// Names come from the Vercel Upstash/KV marketplace integration, not the SDK's
		// own UPSTASH_REDIS_REST_* defaults — which is why Redis.fromEnv() cannot be
		// used and the client is constructed explicitly.
		//
		// KV_REST_API_READ_ONLY_TOKEN is deliberately NOT declared. The limiter's
		// every call is an INCR, and because the store fails closed a read-only token
		// would present as "every AI request rate-limited" rather than as a
		// credentials error. Leaving it undeclared makes that mistake impossible.
		// KV_URL and REDIS_URL are TCP and unusable by this HTTP client.
		KV_REST_API_URL: z.url().optional(),
		KV_REST_API_TOKEN: z.string().min(1).optional(),
		// Distinguishes preview from production deployments sharing one Upstash DB.
		VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
```

and to `runtimeEnv:`:

```js
		KV_REST_API_URL: process.env.KV_REST_API_URL,
		KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN,
		VERCEL_ENV: process.env.VERCEL_ENV,
```

Append to `.env.example`:

```bash
# AI rate limiter — required in production, optional locally (falls back to in-memory).
# Local testing uses serverless-redis-http from docker-compose: http://localhost:8079 / test-token
KV_REST_API_URL=""
KV_REST_API_TOKEN=""
```

Append the same two keys to `.env.test.example`, pointed at SRH:

```bash
KV_REST_API_URL="http://localhost:8079"
KV_REST_API_TOKEN="test-token"
```

- [ ] **Step 3: Write the failing test**

```ts
// server/services/_shared/aiLimits/store/upstash.store.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { CHECK_AND_BUMP_SCRIPT, createUpstashStore } from "./upstash.store";

const withFakeEval = (evalImpl: (...args: never[]) => unknown) => {
	const store = createUpstashStore("http://localhost:1", "t");
	// The adapter's only outbound call is redis.eval; stub it to assert wiring
	// without a network. The live behaviour is covered in Task 7 against SRH.
	// biome-ignore lint/suspicious/noExplicitAny: test seam into the client
	(store as any).__redis.eval = evalImpl;
	return store;
};

describe("upstash store", () => {
	it("passes one key per window and windowMs followed by each max", async () => {
		const evalSpy = vi.fn().mockResolvedValue(1);
		const store = withFakeEval(evalSpy as never);

		await store.checkAndBump(
			[
				{ key: "u1 aggregate", max: 30 },
				{ key: "u1:quizAI", max: 10 },
			],
			60_000,
		);

		const [script, keys, args] = evalSpy.mock.calls[0] as [
			string,
			string[],
			string[],
		];
		expect(script).toBe(CHECK_AND_BUMP_SCRIPT);
		expect(keys).toHaveLength(2);
		expect(keys[0]).toContain("u1 aggregate");
		expect(keys[1]).toContain("u1:quizAI");
		expect(args).toEqual(["60000", "30", "10"]);
	});

	it("namespaces keys so a preview deployment cannot share buckets", async () => {
		const evalSpy = vi.fn().mockResolvedValue(1);
		const store = withFakeEval(evalSpy as never);

		await store.checkAndBump([{ key: "u1:quizAI", max: 10 }], 60_000);

		const keys = (evalSpy.mock.calls[0] as [string, string[], string[]])[1];
		expect(keys[0]).toMatch(/^airl:v1:[a-z]+:u1:quizAI$/);
	});

	it("fails CLOSED when the store errors", async () => {
		const store = withFakeEval(
			(() => Promise.reject(new Error("ECONNREFUSED"))) as never,
		);

		expect(await store.checkAndBump([{ key: "k", max: 10 }], 60_000)).toBe(
			false,
		);
	});

	it("fails CLOSED when the store times out", async () => {
		const timeout = Object.assign(new Error("timed out"), {
			name: "TimeoutError",
		});
		const store = withFakeEval((() => Promise.reject(timeout)) as never);

		expect(await store.checkAndBump([{ key: "k", max: 10 }], 60_000)).toBe(
			false,
		);
	});

	it("never reaches for the read-only token or Redis.fromEnv (AC 16a, 16b)", () => {
		// The limiter only ever writes. A read-only token would fail every INCR, and
		// because the adapter fails closed that surfaces as "every AI request
		// rate-limited" rather than as a credentials error — so the guard is that the
		// name never enters the codebase. fromEnv() reads UPSTASH_REDIS_REST_*, which
		// this deployment does not set.
		const sources = [
			readFileSync("server/services/_shared/aiLimits/store/upstash.store.ts", "utf-8"),
			readFileSync("server/services/_shared/aiLimits/store/index.ts", "utf-8"),
			readFileSync("lib/env.js", "utf-8"),
		].join("\n");

		expect(sources).not.toMatch(/KV_REST_API_READ_ONLY_TOKEN/);
		expect(sources).not.toMatch(/fromEnv\(/);
	});

	it("the script checks every key before incrementing any", () => {
		// A structural assertion on the Lua: the guard loop must close before the
		// first INCR. Two separate loops is the whole reason this is one script.
		const guardLoopEnd = CHECK_AND_BUMP_SCRIPT.indexOf("return 0");
		const firstIncr = CHECK_AND_BUMP_SCRIPT.indexOf("INCR");

		expect(guardLoopEnd).toBeGreaterThan(-1);
		expect(firstIncr).toBeGreaterThan(guardLoopEnd);
	});

	it("sets the TTL only on the transition to 1, keeping the window fixed", () => {
		// PEXPIRE on every increment would make the window rolling: steady traffic
		// would hold it open forever and it would never reset.
		expect(CHECK_AND_BUMP_SCRIPT).toMatch(/==\s*1\s*then[\s\S]*?PEXPIRE/);
	});
});
```

- [ ] **Step 4: Run it, expect FAIL**

Run: `pnpm vitest run --project unit server/services/_shared/aiLimits/store/upstash.store.test.ts`
Expected: FAIL — `Failed to resolve import "./upstash.store"`.

- [ ] **Step 5: Implement**

```ts
// server/services/_shared/aiLimits/store/upstash.store.ts
import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";
import type { LimitWindow, RateLimitStore } from "./types";

/**
 * One round trip, bounded. The limiter sits on the hot path of every AI request,
 * and an unreachable store must not hold an SSE route open until the 30s model
 * timeout — that turns a dependency outage into resource exhaustion on our side.
 */
export const STORE_TIMEOUT_MS = 1_000;

/**
 * Bumped when the key SHAPE changes, so a redeploy cannot half-read old counters.
 * The environment segment keeps a Vercel preview deployment off production's
 * buckets when both point at one Upstash database.
 */
export const keyPrefix = (): string =>
	`airl:v1:${env.VERCEL_ENV ?? env.NODE_ENV}:`;

/**
 * Atomic multi-window check-then-bump. Redis runs a script atomically, which is
 * what replaces the "no await between peek and bump" guarantee the in-memory
 * adapter gets from Node's single thread. Two round trips would not be atomic.
 *
 * KEYS: one per window.  ARGV: [windowMs, max_1 … max_n].
 *
 * The two loops are the contract: EVERY key is checked before ANY is
 * incremented, so a rejected call spends nothing. PEXPIRE fires only on the
 * transition to 1 — refreshing it on every increment would turn the fixed window
 * into a rolling one that steady traffic never resets.
 */
export const CHECK_AND_BUMP_SCRIPT = `
local windowMs = tonumber(ARGV[1])
for i = 1, #KEYS do
  local current = tonumber(redis.call('GET', KEYS[i]) or '0')
  if current >= tonumber(ARGV[i + 1]) then
    return 0
  end
end
for i = 1, #KEYS do
  if redis.call('INCR', KEYS[i]) == 1 then
    redis.call('PEXPIRE', KEYS[i], windowMs)
  end
end
return 1
`;

export const createUpstashStore = (
	url: string,
	token: string,
): RateLimitStore => {
	const redis = new Redis({
		url,
		token,
		signal: () => AbortSignal.timeout(STORE_TIMEOUT_MS),
		// No retries: a retry doubles latency on every AI request to buy a second
		// chance at a call that fail-closed already handles. Budget over blip.
		retry: { retries: 0 },
	});

	const prefixed = (key: string) => `${keyPrefix()}${key}`;

	const store: RateLimitStore = {
		checkAndBump: async (
			windows: readonly LimitWindow[],
			windowMs: number,
		): Promise<boolean> => {
			try {
				const result = await redis.eval(
					CHECK_AND_BUMP_SCRIPT,
					windows.map((w) => prefixed(w.key)),
					[String(windowMs), ...windows.map((w) => String(w.max))],
				);
				return Number(result) === 1;
			} catch (error) {
				// FAIL CLOSED. The limiter caps real spend and prices a brute-force
				// search; a limiter that opens under load is not a limiter, because
				// inducing that load is cheap. Availability cost is security.md S4.
				console.error(
					"[aiLimits] rate-limit store unavailable — failing closed",
					error,
				);
				return false;
			}
		},

		countForTest: async (key: string): Promise<number> => {
			const value = await redis.get<string | number | null>(prefixed(key));
			return value === null || value === undefined ? 0 : Number(value);
		},

		resetForTest: async (): Promise<void> => {
			const keys = await redis.keys(`${keyPrefix()}*`);
			if (keys.length > 0) await redis.del(...keys);
		},
	};

	// Test seam: upstash.store.test.ts stubs this to assert wiring without a network.
	return Object.assign(store, { __redis: redis });
};
```

- [ ] **Step 6: Run, expect PASS** — then `pnpm typecheck && pnpm check`.

Run: `pnpm vitest run --project unit server/services/_shared/aiLimits/store/upstash.store.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(aiLimits): add Upstash Redis store adapter with atomic Lua check-and-bump"
```

---

## Task 5: Store selection and the production assertion

The control that stops a missing env var from silently reopening R3 (spec AC 17, security.md S6).

**Files:**
- Modify: `server/services/_shared/aiLimits/store/index.ts` (replaces Task 2's placeholder)
- Test: `server/services/_shared/aiLimits/store/index.test.ts`

**Interfaces:**
- Consumes: `memoryStore`, `createUpstashStore`.
- Produces: `selectStore(config: StoreConfig): RateLimitStore`; `rateLimitStore: RateLimitStore`.

- [ ] **Step 1: Write the failing test**

```ts
// server/services/_shared/aiLimits/store/index.test.ts
import { describe, expect, it } from "vitest";
import { memoryStore } from "./memory.store";
import { selectStore } from "./index";

const UPSTASH = {
	url: "https://example.upstash.io",
	token: "tok",
};

describe("selectStore", () => {
	it("uses the memory adapter outside production when Upstash is absent", () => {
		expect(selectStore({ nodeEnv: "development" })).toBe(memoryStore);
		expect(selectStore({ nodeEnv: "test" })).toBe(memoryStore);
	});

	it("uses Upstash when both credentials are present", () => {
		expect(selectStore({ nodeEnv: "development", ...UPSTASH })).not.toBe(
			memoryStore,
		);
	});

	it("throws in production when the URL is missing", () => {
		// Without this, a forgotten Vercel env var puts production back on a
		// per-process Map while every test and the conformance matrix stay green.
		expect(() => selectStore({ nodeEnv: "production" })).toThrow(
			/KV_REST_API_URL/,
		);
	});

	it("throws in production when the token is missing", () => {
		expect(() =>
			selectStore({ nodeEnv: "production", url: UPSTASH.url }),
		).toThrow(/KV_REST_API_TOKEN/);
	});

	it("never silently downgrades production to memory", () => {
		expect(() => selectStore({ nodeEnv: "production" })).toThrow();
	});
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm vitest run --project unit server/services/_shared/aiLimits/store/index.test.ts`
Expected: FAIL — `selectStore` is not exported from `./index`.

- [ ] **Step 3: Implement**

```ts
// server/services/_shared/aiLimits/store/index.ts
import { env } from "@/lib/env";
import { memoryStore } from "./memory.store";
import type { RateLimitStore } from "./types";
import { createUpstashStore } from "./upstash.store";

export type StoreConfig = {
	nodeEnv: string;
	url?: string;
	token?: string;
};

/**
 * Pure and exported so the production assertion is testable — a throw at module
 * load is not.
 *
 * The assertion is the point of this function. The env vars are optional in
 * lib/env.js so CI and a fresh checkout need no Redis; without a hard failure in
 * production, a forgotten Vercel variable would put the platform back on the
 * per-process Map with the whole suite still green (security.md S6).
 */
export const selectStore = (config: StoreConfig): RateLimitStore => {
	const { nodeEnv, url, token } = config;

	if (url && token) return createUpstashStore(url, token);

	if (nodeEnv === "production") {
		const missing = [
			url ? null : "KV_REST_API_URL",
			token ? null : "KV_REST_API_TOKEN",
		].filter(Boolean);

		throw new Error(
			`AI rate limiter: ${missing.join(" and ")} must be set in production. ` +
				"Falling back to the in-memory limiter would make the ceiling per-instance, " +
				"which does not hold on serverless (risk R3).",
		);
	}

	return memoryStore;
};

export const rateLimitStore: RateLimitStore = selectStore({
	nodeEnv: env.NODE_ENV,
	url: env.KV_REST_API_URL,
	token: env.KV_REST_API_TOKEN,
});
```

- [ ] **Step 4: Run, expect PASS** — then the whole suite.

Run: `pnpm vitest run --project unit server/services/_shared/aiLimits/`
Expected: PASS.

Run: `pnpm typecheck && pnpm check && pnpm test`
Expected: PASS. Tests still use memory, because `.env.test` has no Upstash URL yet.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(aiLimits): select the store at load and fail startup without Upstash in production"
```

---

## Task 6: A local Redis for tests (SRH)

`@upstash/redis` speaks HTTP, not the Redis wire protocol, so a plain `redis:7` container is not
enough. `serverless-redis-http` is the proxy Upstash itself documents for local development.

The Vercel integration's real credentials are already in `.env.local` (commented out), so pointing
the tests at the live Upstash database would also work. Prefer SRH anyway: the suite calls
`resetForTest()`, which deletes every key under the prefix, and the distribution test asserts on an
exact shared count — both are hostile to a database anything else might be using, and neither should
depend on network reachability or burn Upstash quota on every `pnpm test`.

**Files:**
- Modify: `docker-compose.yaml`
- Modify: `vitest.config.ts`
- Modify: `package.json` (`test:redis` script)
- Modify: `README.md` (local setup)

- [ ] **Step 1: Add Redis + SRH to docker-compose**

```yaml
  redis:
    image: redis:7-alpine
    restart: always
    container_name: learnix-redis
    ports:
      - '6379:6379'

  srh:
    # @upstash/redis speaks HTTP/REST, not the Redis wire protocol. SRH is the
    # HTTP proxy Upstash documents for local development and testing.
    image: hiett/serverless-redis-http:latest
    restart: always
    container_name: learnix-srh
    ports:
      - '8079:80'
    environment:
      SRH_MODE: env
      SRH_TOKEN: test-token
      SRH_CONNECTION_STRING: 'redis://redis:6379'
    depends_on:
      - redis
```

- [ ] **Step 2: Add the test tier**

In `vitest.config.ts`, add a third project after `integration`:

```ts
			defineProject({
				resolve: { tsconfigPaths: true },
				test: {
					name: "redis",
					environment: "node",
					include: ["**/*.redis.test.ts"],
					exclude: ["**/node_modules/**"],
					setupFiles: ["./test/loadEnv.ts"],
					// One shared Redis, and the distribution test asserts on a shared
					// ceiling — parallel files would race on the same keys.
					fileParallelism: false,
				},
			}),
```

In `package.json`, next to the other test scripts:

```json
		"test:redis": "vitest run --project redis --passWithNoTests",
```

`pnpm test` runs every project, so this tier is included automatically. The tests in Task 7 skip
themselves when `KV_REST_API_URL` is absent, so a contributor without the container still
gets a green `pnpm test`.

- [ ] **Step 3: Document it in README**

Under the local database section:

```markdown
The rate limiter's Redis-backed tests need the `redis` + `srh` services from `docker-compose.yaml`
(`docker-compose up -d`) and the two `UPSTASH_*` values from `.env.test.example` in your `.env.test`.
Without them `pnpm test:redis` skips rather than fails.
```

- [ ] **Step 4: Verify the containers work**

Run:
```bash
docker-compose up -d redis srh
curl -s -H "Authorization: Bearer test-token" http://localhost:8079/set/ping/pong
```
Expected: `{"result":"OK"}`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test(aiLimits): add local Redis + serverless-redis-http and a redis test tier"
```

---

## Task 7: Prove distribution — the test that closes R3

The deliverable of this whole feature. Everything before it is plumbing.

**Files:**
- Create: `server/services/_shared/aiLimits/store/upstash.redis.test.ts`

- [ ] **Step 1: Write the test**

```ts
// server/services/_shared/aiLimits/store/upstash.redis.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { createRateLimiter } from "../checkAiRateLimit";
import { describeRateLimiterContract } from "./storeContract";
import { createUpstashStore } from "./upstash.store";

const url = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_TOKEN;
const configured = Boolean(url && token);

// Skips rather than fails when the SRH container is not running, so a fresh
// checkout still gets a green `pnpm test`.
describe.skipIf(!configured)("upstash store against a real Redis", () => {
	const store = createUpstashStore(url as string, token as string);

	// The same nine behavioural properties the memory adapter passes. This is what
	// makes the Lua script match the Map rather than approximate it.
	describeRateLimiterContract("upstash", store);

	describe("distribution (AC 9) — the property that closes R3", () => {
		beforeEach(async () => {
			await store.resetForTest();
		});

		it("shares one ceiling across two independent clients", async () => {
			// Two clients standing in for two Vercel serverless instances. On the
			// memory adapter each would hold its own Map and BOTH loops would be
			// allowed in full — that is exactly risk R3, and it is why this test
			// belongs to the Redis adapter alone.
			const instanceA = createRateLimiter(
				createUpstashStore(url as string, token as string),
			);
			const instanceB = createRateLimiter(
				createUpstashStore(url as string, token as string),
			);

			let allowed = 0;
			for (let i = 0; i < 12; i++) {
				if (await instanceA.checkAiRateLimit("u-dist", "quizAI")) allowed++;
			}
			for (let i = 0; i < 12; i++) {
				if (await instanceB.checkAiRateLimit("u-dist", "quizAI")) allowed++;
			}

			// quizAI's ceiling is 10. Per-instance counting would give 20.
			expect(allowed).toBe(10);
		});

		it("counts one aggregate budget across instances too", async () => {
			const instanceA = createRateLimiter(
				createUpstashStore(url as string, token as string),
			);
			const instanceB = createRateLimiter(
				createUpstashStore(url as string, token as string),
			);

			let allowed = 0;
			for (let i = 0; i < 40; i++) {
				const limiter = i % 2 === 0 ? instanceA : instanceB;
				const feature = i % 4 < 2 ? "courseAI" : "lessonAI";
				if (await limiter.checkAiRateLimit("u-agg", feature)) allowed++;
			}

			expect(allowed).toBe(30);
		});
	});

	describe("fixed window (AC 11)", () => {
		beforeEach(async () => {
			await store.resetForTest();
		});

		it("sets a TTL on first use and does not extend it on later calls", async () => {
			// A rolling window would refresh the TTL on every increment, so steady
			// traffic would hold the window open and it would never reset.
			await store.checkAndBump([{ key: "ttl-probe", max: 10 }], 60_000);
			// biome-ignore lint/suspicious/noExplicitAny: test seam into the client
			const redis = (store as any).__redis;
			const first = await redis.pttl(`airl:v1:test:ttl-probe`);

			await new Promise((resolve) => setTimeout(resolve, 150));
			await store.checkAndBump([{ key: "ttl-probe", max: 10 }], 60_000);
			const second = await redis.pttl(`airl:v1:test:ttl-probe`);

			expect(second).toBeLessThan(first);
			expect(await store.countForTest("ttl-probe")).toBe(2);
		});

		it("expires the window, allowing calls again", async () => {
			for (let i = 0; i < 2; i++) {
				await store.checkAndBump([{ key: "short", max: 2 }], 300);
			}
			expect(await store.checkAndBump([{ key: "short", max: 2 }], 300)).toBe(
				false,
			);

			await new Promise((resolve) => setTimeout(resolve, 400));

			expect(await store.checkAndBump([{ key: "short", max: 2 }], 300)).toBe(
				true,
			);
		});
	});
});
```

- [ ] **Step 2: Run with the container up, expect PASS**

```bash
docker-compose up -d redis srh
cp .env.test.example .env.test   # if not already present; keep your DATABASE_URL
pnpm test:redis
```
Expected: PASS — 9 contract tests under "rate limiter contract — upstash", 2 distribution tests, 2
fixed-window tests.

Note: the `pttl` key in the TTL test assumes `VERCEL_ENV` is unset and `NODE_ENV` is `test`. If the
prefix differs in your shell, read it from `keyPrefix()` instead of hard-coding it.

- [ ] **Step 3: Prove the distribution test is meaningful**

Temporarily swap `createUpstashStore(...)` for `memoryStore` in the two distribution tests and re-run.
Expected: **FAIL** — `allowed` is 20 and 60, not 10 and 30. This is the R3 defect reproducing. Revert.

- [ ] **Step 4: Confirm it skips cleanly without Redis**

```bash
docker-compose stop srh redis
pnpm test:redis
```
Expected: the suite reports skipped, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test(aiLimits): prove the ceiling holds across instances (closes R3)"
```

---

## Task 8: Gate Docs (DoD)

The per-process claims across the docs are true until Task 7 lands and false afterwards.

**Files:**
- Modify: `docs/specs/features/distributed-ai-rate-limiter/spec.md` (frontmatter `status`)
- Modify: `docs/adr/027-distributed-ai-rate-limiting.md` (`Status: Accepted`)
- Modify: `docs/specs/features/ai-tutor-guardrails/threat-model.md` (`:231`, `:322`, `:351`)
- Modify: `docs/specs/features/ai-tutor-guardrails/security.md` (S13 §17)
- Modify: `docs/specs/features/ai-defence-layers/security.md` (S16 §6, S16 §8)
- Modify: `docs/specs/features/ai-tutor-guardrails/spec.md` (`:142`, `:322`)
- Modify: `docs/specs/features/ai-input-trust-boundary/spec.md` (`:234`)
- Modify: `README.md` (required Vercel env vars)

- [ ] **Step 1: Flip the statuses**

`spec.md` frontmatter `status: planned` → `status: stable`. ADR-027 `Status: Proposed` → `Accepted`.

- [ ] **Step 2: Close R3 where it is recorded**

In `threat-model.md`, change the R3 row and the conformance-matrix row
(`| In-memory rate limiter | LLM10 / A04 | B1 | **open — R3** |`) to closed, naming ADR-027 and the
distribution test as the evidence. Update the STRIDE DoS row at `:231`, which still says "the
effective guarantee is 20 requests per *instance*, not per user."

Rewrite `ai-tutor-guardrails/security.md` S13 §17 the way its already-closed items are written —
keep the history, state what closed it and when.

In `ai-defence-layers/security.md`, S16 §6 ("The limiter stays per-process") is now closed; S16 §8
(pressure eviction fails open) applies only to the memory adapter, which is no longer the production
path. Do **not** delete either — mark them, so the register keeps its history.

**Do not touch `docs/specs/features/quiz-answer-key/security.md`.** Its S13 §17 reference is
conditional on the quiz cooldown ever being moved *into* the in-process limiter, which this feature
does not do; that note stays correct as written.

- [ ] **Step 3: Add the new residuals**

Confirm `distributed-ai-rate-limiter/security.md` S4 (availability), S5 (latency) and S6 (silent
downgrade) describe what shipped. If the timeout, retry count or key prefix changed during
implementation, update S4/S5 to the real values.

- [ ] **Step 4: README + index**

Add `KV_REST_API_URL` / `KV_REST_API_TOKEN` to the README's required Vercel env vars,
noting that production **fails to start** without them.

Run: `pnpm spec:sync`
Expected: `_index.md`'s `distributed-ai-rate-limiter` row flips to `stable`, nothing else moves.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs(distributed-ai-rate-limiter): close R3 across the security registers"
```

---

## Self-review

**Spec coverage** — every acceptance criterion mapped to a task:

| AC | Criterion | Task |
|---|---|---|
| 1 | Check all windows before incrementing any; rejection increments none | 1 (memory), 4 (Lua), 3 + 7 (both adapters) |
| 2 | One aggregate bucket of 30 across all surfaces | 3 → 7 |
| 3 | Per-feature ceilings | 3 → 7 |
| 4 | learningPathAI 1/min per (student, course), not collapsed | 3 → 7 |
| 5 | `countAggregate: false` spends one aggregate slot | 3 → 7 |
| 6 | Per-user isolation | 3 → 7 |
| 7 | Hostile scope cannot collide | 3 → 7 |
| 8 | Window expires | 3 (memory), 7 ("expires the window, allowing calls again") |
| 9 | **Two clients share a ceiling** | **7** |
| 10 | Version + environment key prefix | 4 |
| 11 | Fixed window — PEXPIRE only on transition to 1 | 4 (structural), 7 (live TTL) |
| 12 | Store error/timeout → `false` → 429 / `TOO_MANY_REQUESTS` | 4 (store), 2 (middleware/routes carry it) |
| 13 | Bounded by a short timeout | 4 (`STORE_TIMEOUT_MS`, `signal`) |
| 14 | Underlying error logged, never returned | 4 |
| 15 | Rejection messages leak no window/count/reset | 2 (message unchanged); `limiterMessages.contract.test.ts` re-run in 5 |
| 16 | Env vars in `lib/env.js`, optional | 4 |
| 16a | `KV_REST_API_READ_ONLY_TOKEN` appears nowhere | 4 (source-scan test) |
| 16b | Client constructed explicitly, never `Redis.fromEnv()` | 4 (same test) |
| 17 | Production startup fails without the URL | 5 |
| 18 | Adapter chosen once at module load | 5 |
| 19 | Four existing contract tests still pass | 2 + 5 (verified: no scan matches `await`) |
| 20 | Role check rejects before the limiter is touched | 2 (integration test updated, not weakened) |
| 21 | `resourceLimits: APPLIED` stays accurate | 5 (full suite green) |

No gaps.

**Placeholder scan:** no `TBD` / `TODO` / "handle edge cases" / "similar to Task N" in any code step.
Task 7's TTL test carries an explicit note about the hard-coded prefix rather than leaving it
implicit.

**Type consistency:** `RateLimitStore` (`checkAndBump` / `countForTest` / `resetForTest`) and
`LimitWindow` (`{ key, max }`) are used identically in Tasks 1, 3, 4, 5, 7. `createRateLimiter`
returns `{ checkAiRateLimit, aggregateCountForTest, featureCountForTest, resetForTest }` in Task 2
and is destructured with exactly those names in Tasks 3 and 7. `__windowSizeForTest` is a
memory-store export in Tasks 1, 2 and 3 — never on the port.

**Known rough edge, flagged deliberately:** the `__redis` test seam
(`Object.assign(store, { __redis: redis })`) leaks the client through the port type. It is used by
`upstash.store.test.ts` and by Task 7's TTL assertion. The cleaner alternative — injecting the client
— costs a constructor parameter that nothing else needs. If the reviewer prefers injection, change it
in Task 4 and update the two call sites in Task 7.

## Final verification

```bash
pnpm typecheck          # catches any missed await at the five call sites
pnpm check              # Biome
pnpm test:unit          # memory adapter + selection + Lua structure
pnpm test:integration   # requires learnix_test; middleware ordering intact
docker-compose up -d redis srh
pnpm test:redis         # 9 contract + 2 distribution + 2 fixed-window
```

Manual, end to end:

1. `pnpm dev` **without** `UPSTASH_*` set → AI features work on the memory adapter; no startup error.
2. Set the two vars to the SRH endpoint, restart, hit the lesson tutor 11 times inside a minute →
   the 11th returns 429. `docker exec learnix-redis redis-cli --scan --pattern 'airl:v1:*'` shows the
   keys, and `PTTL` on one is ≤ 60000.
3. Start a **second** `pnpm dev` on another port against the same SRH; exhaust the ceiling on the
   first and confirm the second rejects immediately. This is R3 closed, observed by hand.
4. `docker-compose stop srh` with the vars still set → AI requests return 429 within ~1 s (not a 30 s
   hang), and the server log carries `[aiLimits] rate-limit store unavailable — failing closed`.
5. `NODE_ENV=production pnpm build` with the vars unset → fails with the `KV_REST_API_URL`
   message rather than starting on the memory adapter.