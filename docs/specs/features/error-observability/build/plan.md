# Error Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax. See [`../spec.md`](../spec.md) for the design and Acceptance criteria,
> and [`../security.md`](../security.md) (S1–S16) for the threat pass every control here answers.

**Goal:** Ship Sentry as a server-only, errors-only tracker for the whole app, such that no error path
ends in silence and no model text, email address, or database argument ever leaves the process.

**Architecture:** One funnel. Every capture point — the consola reporter, the tRPC error middleware,
`onRequestError`, `safeRequest`, and the client-boundary server action — calls a single
`reportError()`. That function never reads `error.message`; it builds a **synthetic error tree** from
a closed field set and hands *that* to Sentry, so `linkedErrors` walks our projection instead of the
real `cause` chain. `beforeSend` re-scrubs as defence in depth and enforces a per-fingerprint throttle.

**Exactly three files may import `@sentry/nextjs`** — `sentry.server.config.ts` (init),
`instrumentation.ts` (`onRequestError`), and `server/observability/reportError.ts` (the funnel, which
exports `reportError` for errors and `reportMessage` for the security-event case). Everything else
imports from `server/observability/`. This is not a style rule: the projection is the enforcement
point for AC 10/11, so a service that calls `Sentry.captureException` directly bypasses it and puts
`OutputParserException.message` — the whole model output — into the issue title. It also bypasses the
AC 2 dedup marker and the AC 41 abort filter. **Task 14 makes the boundary a contract test**, in the
`ROOTS`/`OWNERS` shape of `aiLimits.contract.test.ts:210-232`, because a convention nobody scans for
is a convention that decays on the first "quick fix".

**Tech Stack:** `@sentry/nextjs@10.70.0` (supports `next ^16.0.0-0`), consola 3.4.2, tRPC 11, Vitest
projects (`unit` / `integration` / `redis`), Biome.

## Codebase anchors (verified during planning)

- `server/api/trpc.ts:97-112` — `timingMiddleware`, a private `const` that does **not** wrap `next()`
  in try/catch. `publicProcedure` (`:121`) and `protectedProcedure` (`:131`) both `.use()` it, and
  every role procedure builds on `protectedProcedure` (`:156-167`, `:178`, `:189`, `:200`). **Two
  insertion points cover 100% of procedures.** Because it is not exported, AC 40 must edit it in
  place, not compose around it.
- `trpc/server.ts:25` — `createCaller`; the RSC path never reaches `app/api/trpc/[trpc]/route.ts`.
- `server/services/_shared/aiLimits/store/index.ts:34-53` — `selectStore`, the **exact** precedent for
  AC 30/31: exported pure function, `MEMORY_ALLOWED_ENVS = new Set(["development","test"])` (`:21`),
  throw with a reason. Comment at `:23-25` says it is exported standalone "so the production assertion
  is testable — a throw at module load is not."
- `lib/env.js:53-72` — the KV comment block documenting *why* production-required vars are `.optional()`
  + asserted at point of use, never `.refine()`: `test/loadEnv.ts` sets `SKIP_ENV_VALIDATION` for every
  test tier, and on Vercel a refine fires at build rather than cold start.
- `test/loadEnv.ts:1-4` — sets `SKIP_ENV_VALIDATION` unconditionally. **Consequence: no AC 30/31 test
  may import `lib/env.js` under a mutated `NODE_ENV`** — it must call the pure function directly.
- `server/services/_shared/aiGuard/securityLog.ts:11-25` — the enumerate-don't-spread shape the
  projection copies, and its header comment explaining why that *is* the enforcement mechanism.
- `server/services/_shared/aiGuard/types.ts:72-86` — `SecurityOutcome`, **eight** members.
- `server/services/_shared/conformance/aiSurfaces.ts:72` — records `output_validation_failed` as
  report-only with a **measured ~10% false-positive rate** over every persisted model-authored field.
  This is why AC 37 excludes it.
- `server/services/_shared/conformance/aiSurfaces.contract.test.ts:1-22` — the repo's source-scan
  idiom: local `walk()` via `readdirSync`/`statSync` (not glob), `code()` stripping comments, then
  `expect(offenders, offenders.join("\n")).toEqual([])`. Non-vacuity is a sibling
  `.toBeGreaterThanOrEqual(N)` floor test (`:100-103`).
- `server/services/_shared/aiLimits/aiLimits.contract.test.ts:210-232` — the `ROOTS` + `OWNERS`
  allowlist variant, the template for AC 9/17/20/29/34.
- `server/services/_shared/aiGuard/securityLog.test.ts:16-37` and `:100-114` — the logger-assertion
  idiom (`Object.keys(fields).sort()`) and the redaction idiom
  (`JSON.stringify(mock.calls[0])` + `.not.toContain(PAYLOAD)`). AC 11/13/16/19 reuse the latter.
- `server/services/courseAI/graph/withNodeErrors.test.ts:41-52` — `expect(mockLogger.error).not.toHaveBeenCalled()`
  for the abort path; AC 41 reuses it.
- Mocking idiom is `vi.hoisted` + `vi.mock`, never `vi.spyOn` on a singleton. Partial-mock shape with
  `importOriginal` at `server/api/routers/aiRateLimit.middleware.integration.test.ts:21-29` — that is
  how to stub `Sentry.captureException` while keeping `withSentryConfig` intact.
- `server/api/routers/aiRateLimit.middleware.integration.test.ts:2` — `Object.assign(process.env, { NODE_ENV: "production" })`
  at the top of the file, before imports, to force `timingMiddleware`'s prod branch.
- `server/services/auth/auth.service.ts:9-13` + `auth.errors.ts` — `AuthError extends DomainError {}`
  passing **no code**, so `DomainError`'s default `INTERNAL_SERVER_ERROR` applies. This is AC 26's
  root cause, and `instructorService.createInstructor` calls the same `authService.signUp`, so **one
  fix covers both public procedures**.
- `server/services/email/email.service.ts:62-66` — `toEmail` in a `logger.error` call (AC 17).
- `server/services/_shared/aiLimits/store/upstash.store.ts:105-123` — already logs `error.name` only;
  AC 19's shape already exists here, so this is a `console.error → logger` conversion, not a redaction fix.
- `server/services/lessonAI/lessonAI.service.ts:240-246` — `catch (_error)` whose `finally` depends on
  the swallow. Log the class; **do not rethrow.**
- `server/services/courseAI/graph/nodeErrors.ts:37-38` — `isNodeAbort`, reused by AC 41.
- `server/services/_shared/aiLimits/store/memory.store.ts` — `EVICT_THRESHOLD` + `globalThis` pinning,
  the shape AC 25's throttle copies.
- `biome.jsonc` — **no `suspicious.noConsole` rule**; 17 live `console.*` sites pass `pnpm check`
  today. The AC 9 scan is the only thing that will enforce their removal.
- `lib/requests/**` — **34 files, all 34 with `console.error`**: 28 with a descriptive prefix, 6 bare.
  Fallbacks are **not** uniformly `null` (`getEnrollmentStatus.ts:13`, `getPublishedCourses.ts:17`,
  `getStudentEnrolledCourses.ts:16`, `getCoursesStats.ts:8`).
- SDK facts confirmed against `@sentry/nextjs@10.70.0`: `linkedErrors` default limit **5**, key
  `"cause"`; `initWithoutDefaultIntegrations()` exists; `sourcemaps.deleteSourcemapsAfterUpload`
  already defaults to `true`; `tunnelRoute: "/sentry-tunnel"` is in Sentry's own recommended snippet,
  so the wizard will add it.

**Per-task conventions:** after the implementation step, `pnpm typecheck` and `pnpm check` must be
clean before committing. Unit tests colocated `*.test.ts` (no DB, no network); integration
`*.integration.test.ts`. Source-scan contract tests are named `*.contract.test.ts` and each ships with
its non-vacuity sibling. Arrow-function consts everywhere; component prop types in colocated
`types.ts` (ADR-011). No `Co-Authored-By` trailer on commits.

---

## Task 1: Wizard scaffold, then strip its six defaults

**Files:**
- Run: `npx @sentry/wizard@latest -i nextjs --saas --org learnix-fb --project javascript-nextjs`
- Delete: `instrumentation-client.ts`, `app/sentry-example-page/`, `app/api/sentry-example-api/`
- Modify: `next.config.ts`, `lib/env.js`, `.gitignore`
- Create: `docs/specs/features/error-observability/build/sdk-defaults.md` (the S14 record)

This task is a scaffold-then-strip; it ends green, not mid-break.

- [x] **Step 1: Run the wizard.** The pnpm store prerequisite is already resolved (`storeDir` is
      `~/.local/share/pnpm/store/v3/v10`). Accept source-map upload; **decline** the example page if
      prompted, decline Session Replay, decline Tracing.

- [x] **Step 2: Record the installed SDK's real defaults** — S14 requires these read off the package,
      not assumed. Write `build/sdk-defaults.md` with the version and the four values AC 14/24/35
      depend on:
      ```bash
      node -e "const p=require('@sentry/nextjs/package.json');console.log(p.version)"
      grep -rn "limit" node_modules/@sentry/core/build/cjs/integrations/linkederrors.js | head -5
      node -e "const s=require('@sentry/nextjs');console.log(Object.keys(s).filter(k=>/[Ii]ntegration/.test(k)).join('\n'))"
      ```
      Expected: version `10.70.x`; `linkedErrors` default limit `5`; `initWithoutDefaultIntegrations`
      present in the export list. **If the observed limit is not 5, `LINKED_ERROR_DEPTH` in Task 3
      takes the observed value and this plan's AC 14 test fixture depth changes with it.**

- [x] **Step 3: Strip the six defaults.** Delete `instrumentation-client.ts` and every
      `NEXT_PUBLIC_SENTRY_DSN` reference; delete the example page and example API route; in
      `next.config.ts` set `tracesSampleRate` handling aside (it lives in `sentry.server.config.ts`,
      Task 3), remove `tunnelRoute`, set `widenClientFileUpload: false`, and set
      `sourcemaps: { deleteSourcemapsAfterUpload: true }` explicitly even though it is the default —
      AC 35 asserts the literal.

- [x] **Step 4: Declare the env var** in `lib/env.js`, mirroring the `KV_REST_API_*` block's comment
      style (`lib/env.js:53-72`):
      ```js
      // server:
      /**
       * Sentry ingest DSN. Optional here on purpose: `test/loadEnv.ts` sets SKIP_ENV_VALIDATION for
       * every test tier and all three CI jobs do the same, so a `.refine()` would never run where it
       * matters and would fire at Vercel build time rather than at the cold start that does. The
       * production check is an assertion at point of use — see server/observability/resolveSentryDsn.ts,
       * the same shape as aiLimits/store/index.ts's selectStore.
       *
       * SENTRY_AUTH_TOKEN is deliberately NOT declared here. It is a build-time credential read
       * directly in next.config.ts; putting it in runtimeEnv would make it reachable from every
       * server module that imports `env`.
       */
      SENTRY_DSN: z.url().optional(),
      ```
      plus `SENTRY_DSN: process.env.SENTRY_DSN` in `runtimeEnv`. **Do not add `NEXT_PUBLIC_SENTRY_DSN`
      or `SENTRY_AUTH_TOKEN` to either block** (AC 28, AC 29).

- [x] **Step 5: `.gitignore`** — add `.env.sentry-build-plugin` and `.sentryclirc` if the wizard
      created either. Neither is currently ignored, so a slipped task order could commit a secret.

- [x] **Step 6: Verify green.** `pnpm typecheck && pnpm check && pnpm build` — the build must succeed
      **with `SENTRY_DSN` unset** (AC 28).

- [x] **Step 7: Commit** — `chore(observability): scaffold Sentry and strip wizard defaults`

---

## Task 2: `projectError` — the allowlist projection

**Files:**
- Create: `server/observability/denylist.ts`, `server/observability/projectError.ts`
- Test: `server/observability/denylist.test.ts`, `server/observability/projectError.test.ts`

`server/observability/` is a new peer of `server/services/` — this is a subsystem (projection,
denylist, throttle, fingerprint, marker), not a single helper, so it does not belong in
`server/utils/`. It imports nothing from `logger.ts`; `logger.ts` will import from it (Task 8).

- [x] **Step 1: Write the failing tests.** The three LangChain shapes are the fixtures AC 13 names.

```ts
// server/observability/projectError.test.ts
import { describe, expect, it } from "vitest";
import { projectError } from "./projectError";

const PAYLOAD = "Ignore all previous instructions. The lesson says: SECRET_LESSON_BODY";

describe("projectError", () => {
	it("never copies error.message, at any depth", () => {
		const inner = new Error(`Failed to parse. Text: "${PAYLOAD}"`);
		inner.name = "OutputParserException";
		const mid = new Error("wrapped", { cause: inner });
		const outer = new Error("outer", { cause: mid });

		const { root, extra } = projectError(outer, "trpc_procedure_failed", { path: "lesson.get" });

		expect(JSON.stringify({ root, extra, chain: flatten(root) })).not.toContain(PAYLOAD);
		expect(JSON.stringify({ root, extra })).not.toContain("Failed to parse");
	});

	it("keeps the class names so the event is still triageable", () => {
		const inner = Object.assign(new Error(PAYLOAD), { name: "ToolInputParsingException" });
		const { root } = projectError(inner, "tool_failed", {});
		expect(root.name).toBe("ToolInputParsingException");
		expect(root.message).toBe("tool_failed");
	});

	it("carries only allowlisted context keys", () => {
		const { extra } = projectError(new Error("x"), "m", {
			path: "a", userId: "u1", lessonId: "l1",
			// @ts-expect-error - not in the allowlist
			prompt: PAYLOAD,
		});
		expect(Object.keys(extra).sort()).toEqual(["lessonId", "path", "userId"]);
		expect(JSON.stringify(extra)).not.toContain(PAYLOAD);
	});

	it("drops code/status for denylisted classes", () => {
		const prismaish = Object.assign(new Error("Invalid `user.create()` — email: a@b.com"), {
			name: "PrismaClientValidationError", code: "P2002",
		});
		Object.defineProperty(prismaish.constructor, "name", { value: "PrismaClientValidationError" });
		const { root } = projectError(prismaish, "db_failed", {});
		expect(JSON.stringify(root)).not.toContain("a@b.com");
		expect((root as { code?: string }).code).toBeUndefined();
	});

	it("stops walking the cause chain at LINKED_ERROR_DEPTH", () => {
		let e = new Error("deepest");
		for (let i = 0; i < 12; i++) e = new Error(`level-${i}`, { cause: e });
		expect(flatten(projectError(e, "m", {}).root).length).toBeLessThanOrEqual(5);
	});
});

const flatten = (e: Error): Error[] => {
	const out: Error[] = [];
	let cur: unknown = e;
	while (cur instanceof Error) { out.push(cur); cur = (cur as { cause?: unknown }).cause; }
	return out;
};
```

- [x] **Step 2: Run it, expect FAIL** — `pnpm vitest run --project unit server/observability/projectError.test.ts`
      Expected: FAIL — "Cannot find module './projectError'".

- [x] **Step 3: Implement.**

```ts
// server/observability/denylist.ts
/**
 * Classes whose own fields carry payload. Reduced to the class name alone.
 * One constant, two consumers (projectError and beforeSend) — adding a fifth
 * leaky dependency is a one-line change with an existing test.
 * See ../spec.md AC 15 and ../security.md S2.
 */
export const CLASS_DENYLIST = [
	"UpstashError",
	"PrismaClient",
	"StripeError",
	"ResendSendError",
] as const;

export const isDenylisted = (ctorName: string): boolean =>
	CLASS_DENYLIST.some(
		(d) => ctorName === d || (d === "PrismaClient" && ctorName.startsWith("PrismaClient")),
	);
```

```ts
// server/observability/projectError.ts
import { isDenylisted } from "./denylist";

/** Confirmed against @sentry/nextjs@10.70.0: linkedErrors walks `cause` 5 deep by default. */
export const LINKED_ERROR_DEPTH = 5;

const CONTEXT_KEYS = [
	"feature", "node", "path", "op",
	"lessonId", "courseId", "generationId", "userId",
] as const;

export type ProjectionContext = Partial<Record<(typeof CONTEXT_KEYS)[number], string>>;

/**
 * The enforcement point for ../spec.md AC 10.
 *
 * This function NEVER reads `error.message`. Three LangChain constructors put the
 * entire model output there (OutputParserException, ToolInputParsingException,
 * LangGraph InvalidUpdateError), and Prisma puts query arguments there. A denylist
 * would have to anticipate each; an allowlist does not — so `message` is simply not
 * a field any code path here is capable of copying.
 *
 * It also builds a SYNTHETIC error chain rather than handing Sentry the real one:
 * `linkedErrors` walks `.cause` and turns each link into its own exception.values[]
 * entry, so redacting only the top frame would transmit the raw original.
 *
 * Field reads are enumerated one at a time, never spread — the same mechanism, and
 * for the same stated reason, as aiGuard/securityLog.ts:11-25.
 */
class ProjectedError extends Error {
	constructor(
		message: string,
		name: string,
		fields: { code?: string | number; status?: number; lcErrorCode?: string },
		cause?: ProjectedError,
	) {
		super(message, cause ? { cause } : undefined);
		this.name = name;
		if (fields.code !== undefined) Object.assign(this, { code: fields.code });
		if (fields.status !== undefined) Object.assign(this, { status: fields.status });
		if (fields.lcErrorCode !== undefined) Object.assign(this, { lcErrorCode: fields.lcErrorCode });
	}
}

const ctorNameOf = (error: unknown): string =>
	(error as { constructor?: { name?: string } })?.constructor?.name ?? typeof error;

const scalarFieldsOf = (error: unknown, ctorName: string) => {
	if (isDenylisted(ctorName)) return {};
	const e = error as Record<string, unknown>;
	return {
		code: typeof e?.code === "string" || typeof e?.code === "number" ? e.code : undefined,
		status: typeof e?.status === "number" ? e.status : undefined,
		lcErrorCode: typeof e?.lc_error_code === "string" ? e.lc_error_code : undefined,
	};
};

export const pickAllowlistedContext = (context?: ProjectionContext): Record<string, string> => {
	const out: Record<string, string> = {};
	for (const key of CONTEXT_KEYS) {
		const value = context?.[key];
		if (typeof value === "string" && value.length > 0) out[key] = value;
	}
	return out;
};

export const projectError = (
	error: unknown,
	staticMessage: string,
	context?: ProjectionContext,
): { root: Error; extra: Record<string, string> } => {
	const levels: unknown[] = [];
	let cursor: unknown = error;
	while (cursor !== undefined && cursor !== null && levels.length < LINKED_ERROR_DEPTH) {
		levels.push(cursor);
		cursor = (cursor as { cause?: unknown })?.cause;
	}

	let built: ProjectedError | undefined;
	for (let i = levels.length - 1; i >= 0; i--) {
		const ctorName = ctorNameOf(levels[i]);
		const message = i === 0 ? staticMessage : `caused by ${ctorName}`;
		const name = levels[i] instanceof Error ? ((levels[i] as Error).name ?? ctorName) : ctorName;
		built = new ProjectedError(message, name, scalarFieldsOf(levels[i], ctorName), built);
	}

	return {
		root: built ?? new ProjectedError(staticMessage, "UnknownError", {}),
		extra: pickAllowlistedContext(context),
	};
};
```

- [x] **Step 4: Run it, expect PASS** — plus `pnpm typecheck` and `pnpm check` clean.

- [x] **Step 5: Commit** — `feat(observability): add allowlist error projection`

---

## Task 3: The redaction net, fingerprint, throttle, and captured marker

**Files:**
- Create: `server/observability/redact.ts`, `fingerprint.ts`, `throttle.ts`, `capturedMarker.ts`
- Test: one `.test.ts` per file

- [x] **Step 1: Write the failing tests.** Key ones, abbreviated — the full set covers AC 16, 22, 23,
      24, 25.

```ts
// server/observability/throttle.test.ts
import { describe, expect, it } from "vitest";
import { createThrottle, SENTRY_MAX_PER_FINGERPRINT, EVICT_THRESHOLD } from "./throttle";

describe("throttle", () => {
	it("drops past the per-fingerprint budget but not a different fingerprint", () => {
		let now = 0;
		const t = createThrottle(() => now);
		const dropped = Array.from({ length: 1000 }, (_, i) =>
			t.shouldThrottle(i === 500 ? "other" : "UpstashError|aiLimits"),
		);
		expect(dropped.filter((d) => !d).length).toBe(SENTRY_MAX_PER_FINGERPRINT + 1); // +1 for "other"
		expect(dropped[500]).toBe(false);
	});

	it("stays bounded under a high-cardinality fingerprint stream", () => {
		let now = 0;
		const t = createThrottle(() => now);
		for (let i = 0; i < 10_000; i++) { now += 1; t.shouldThrottle(`fp-${i}`); }
		expect(t.sizeForTest()).toBeLessThanOrEqual(EVICT_THRESHOLD);
	});
});
```

```ts
// server/observability/redact.test.ts — AC 16, the exact live payload from email.service.ts:62-66
it("strips addresses from every string leaf", () => {
	const event = {
		message: "resend_failed",
		exception: { values: [{ type: "ResendSendError", value: "Invalid `to` field: alice@example.com" }] },
		extra: { toEmail: "bob@example.com", templateKey: "welcome" },
	};
	expect(JSON.stringify(redactEvent(event))).not.toContain("@example.com");
});
```

- [x] **Step 2: Run them, expect FAIL** (modules not found).

- [x] **Step 3: Implement.** `capturedMarker.ts` is the AC 2 mechanism and must use
      `Object.defineProperty` with `enumerable: false` — a bare assignment would leak into every
      `JSON.stringify` of the error:

```ts
// server/observability/capturedMarker.ts
const KEY = "__sentryCaptured";

export const markCaptured = (error: unknown): void => {
	if (error === null || typeof error !== "object") return;
	Object.defineProperty(error, KEY, { value: true, enumerable: false, configurable: true });
};

export const isCaptured = (error: unknown): boolean =>
	error !== null && typeof error === "object" && (error as Record<string, unknown>)[KEY] === true;
```

`throttle.ts` mirrors `_shared/aiLimits/store/memory.store.ts` (`EVICT_THRESHOLD`, `globalThis`
pinning) but takes an **injectable clock** so no test touches `vi.useFakeTimers()` — the same seam
`createRateLimiter(store)` uses at `checkAiRateLimit.ts:64`.

`fingerprint.ts` builds from server-authored values only — tRPC `path` or route, plus error class.
Never from a message (AC 23).

- [x] **Step 4: Run, expect PASS** — plus `pnpm typecheck`, `pnpm check`.

- [x] **Step 5: Commit** — `feat(observability): add redaction, fingerprint, throttle, marker`

---

## Task 4: `resolveSentryDsn` — the production assertion

**Files:**
- Create: `server/observability/resolveSentryDsn.ts` + `.test.ts`

Exported as a pure function precisely so the assertion is testable — `aiLimits/store/index.ts:23-25`
records the same reasoning ("a throw at module load is not testable").

- [x] **Step 1: Write the failing test.**

```ts
import { describe, expect, it } from "vitest";
import { resolveSentryDsn } from "./resolveSentryDsn";

describe("resolveSentryDsn", () => {
	it.each(["development", "test"])("allows an absent DSN in %s", (nodeEnv) => {
		expect(resolveSentryDsn(nodeEnv, undefined)).toBeUndefined();
	});

	it("throws in production when the DSN is absent", () => {
		expect(() => resolveSentryDsn("production", undefined)).toThrow(/SENTRY_DSN must be set/);
	});

	it("throws for an unset NODE_ENV — allowlist, not a not-equals check", () => {
		// lib/env.js's .default("development") does not apply under SKIP_ENV_VALIDATION,
		// which that file recommends for Docker builds. AC 31.
		expect(() => resolveSentryDsn("", undefined)).toThrow();
		expect(() => resolveSentryDsn("undefined", undefined)).toThrow();
	});

	it("returns the DSN when present", () => {
		expect(resolveSentryDsn("production", "https://k@o0.ingest.sentry.io/1")).toBe(
			"https://k@o0.ingest.sentry.io/1",
		);
	});
});
```

- [x] **Step 2: Run it, expect FAIL.**
- [x] **Step 3: Implement**, mirroring `selectStore` (`aiLimits/store/index.ts:34-53`) including the
      explanatory throw message.
- [x] **Step 4: Run, expect PASS**; `pnpm typecheck`, `pnpm check`.
- [x] **Step 5: Commit** — `feat(observability): assert SENTRY_DSN outside dev and test`

---

## Task 5: `reportError` + Sentry init

**Files:**
- Create: `server/observability/reportError.ts` + `.test.ts`, `sentry.server.config.ts`,
  `instrumentation.ts`
- Test: `server/observability/reportError.test.ts`

- [x] **Step 1: Write the failing test** — AC 11 requires asserting against events produced by
      Sentry's **own** `eventFromException()`, not hand-built objects, because the live leak path puts
      text in `exception.values[0].value` (the issue title).

```ts
const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@sentry/nextjs", async (importOriginal) => ({
	...(await importOriginal<object>()),
	captureException,
	getCurrentScope: () => ({ setContext: vi.fn(), setTag: vi.fn(), addBreadcrumb: vi.fn() }),
}));

it("captures once per error instance and only tags on the second call", async () => {
	const { reportError } = await import("./reportError");
	const err = new Error("boom");
	reportError(err, "trpc_procedure_failed", { path: "course.get" });
	reportError(err, "safeRequest:getCourseById", { op: "getCourseById" });
	expect(captureException).toHaveBeenCalledTimes(1);
});
```

- [x] **Step 2: Run, expect FAIL.**

- [x] **Step 3: Implement `reportError`** — the single funnel. It is **idempotent per error instance**:
      it checks `isCaptured(error)` itself, so `safeRequest` needs no special-casing.

      This module is one of only three files permitted to import `@sentry/nextjs`. It exports **two**
      entry points so no caller ever needs the SDK: `reportError` for thrown errors, and
      `reportMessage` for the security-event case (Task 12), which has no `Error` to project and would
      otherwise be a fourth import site — and therefore a precedent.

```ts
// server/observability/reportError.ts — the ONLY module that calls the Sentry SDK's capture APIs.
import * as Sentry from "@sentry/nextjs";
import { isNodeAbort } from "@/server/services/courseAI/graph/nodeErrors";
import { isCaptured, markCaptured } from "./capturedMarker";
import { fingerprintFor } from "./fingerprint";
import { pickAllowlistedContext, projectError, type ProjectionContext } from "./projectError";

export const reportError = (
	error: unknown,
	staticMessage: string,
	context?: ProjectionContext,
): void => {
	if (isNodeAbort(error)) return;                       // AC 41
	if (context?.op) Sentry.getCurrentScope().setTag("operation", context.op);

	if (isCaptured(error)) return;                        // AC 2 — tag, do not re-capture
	markCaptured(error);

	const { root, extra } = projectError(error, staticMessage, context);
	Sentry.captureException(root, { extra, fingerprint: fingerprintFor(error, context) });
};

/**
 * For signals that are not errors — currently only aiGuard's zero-baseline security
 * outcomes (AC 36). `message` and `fingerprint` are server-authored by the caller and
 * must never be built from user or model text; `context` goes through the same
 * allowlist as reportError, so no extra field can ride along.
 */
export const reportMessage = (
	message: string,
	fingerprint: readonly string[],
	context?: ProjectionContext,
): void => {
	Sentry.captureMessage(message, {
		level: "warning",
		fingerprint: [...fingerprint],
		extra: pickAllowlistedContext(context),
	});
};

/**
 * Attach context to the current request's scope WITHOUT capturing (AC 3).
 * `handleServiceError` calls this; the tRPC middleware does the one capture later in
 * the same continuation. getCurrentScope() — not withScope() — because the Node SDK
 * forks an isolation scope per request via AsyncLocalStorage, so this reaches the
 * later capture; withScope()'s scope would be discarded before the middleware runs.
 */
export const enrichScope = (key: string, context: ProjectionContext): void => {
	Sentry.getCurrentScope().setContext(key, pickAllowlistedContext(context));
};
```

- [x] **Step 4: Implement `sentry.server.config.ts`.** Use `initWithoutDefaultIntegrations` and pin
      the list — this closes residual **S14** structurally rather than by vigilance:

```ts
Sentry.initWithoutDefaultIntegrations({
	dsn: resolveSentryDsn(process.env.NODE_ENV ?? "", process.env.SENTRY_DSN),
	environment: process.env.VERCEL_ENV ?? "development",   // AC 32
	tracesSampleRate: 0,                                    // AC 33
	sendDefaultPii: false,                                  // AC 18
	shutdownTimeout: 2,
	integrations: [
		Sentry.linkedErrorsIntegration({ limit: LINKED_ERROR_DEPTH }),
		Sentry.dedupeIntegration(),
		Sentry.inboundFiltersIntegration(),
	],
	// deliberately absent: captureConsoleIntegration, extraErrorDataIntegration — S14
	beforeSend: (event) => {
		if (shouldThrottle(fingerprintKeyOf(event))) return null;   // AC 24
		return redactEvent(denylistBackstop(event));                // AC 16, 22, 15
	},
});
```

`instrumentation.ts` exports `register()` (nodejs branch only — there are no edge routes) and
`export const onRequestError = Sentry.captureRequestError` (AC 6).

**Timing note:** unlike `getRateLimitStore()`, this file is reached *only* through
`instrumentation.ts`'s dynamic import inside `register()`, which Next calls at server bootstrap and
**not** during `next build`'s page-data collection. So the assertion may fire eagerly at module top
level — no lazy memo needed. Verify in Step 5 that `pnpm build` still succeeds with `SENTRY_DSN` unset.

- [x] **Step 5: Verify.** `pnpm vitest run --project unit server/observability`, then
      `SENTRY_DSN= pnpm build` (must succeed), then `NODE_ENV=production pnpm start` without a DSN
      (must throw the AC 30 error). Note in the README that `pnpm preview` without a DSN now throws
      by design.

- [x] **Step 6: Commit** — `feat(observability): initialise Sentry with a pinned integration list`

---

## Task 6: The tRPC capture point + `handleServiceError`

**Files:**
- Modify: `server/api/trpc.ts:97-112`, `server/utils/handleServiceError.ts`
- Test: `server/api/trpc.sentry.integration.test.ts`, `server/utils/handleServiceError.test.ts`

These land together: AC 12's regression test (an unmapped message no longer reaching the browser) is
untestable if the two are split.

- [x] **Step 1: Write the failing tests.** Mirror
      `aiRateLimit.middleware.integration.test.ts` — including `Object.assign(process.env, { NODE_ENV: "production" })`
      at line 1, before imports, and `createCallerFactory` against a single router.

```ts
it("does not report client-fault codes", async () => {           // AC 4
	for (const code of ["UNAUTHORIZED","FORBIDDEN","NOT_FOUND","BAD_REQUEST","TOO_MANY_REQUESTS","CONFLICT"]) {
		captureException.mockClear();
		await expect(callThrowing(new TRPCError({ code }))).rejects.toThrow();
		expect(captureException).not.toHaveBeenCalled();
	}
});

it("does not leak an unmapped Error.message to the client", () => {   // AC 12
	const parserError = Object.assign(new Error(`Failed to parse. Text: "${PAYLOAD}"`), {
		name: "OutputParserException",
	});
	expect(() => handleServiceError(parserError)).toThrow(
		expect.objectContaining({ code: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred" }),
	);
});

it("attaches DomainError.context", () => {                        // AC 3
	// fixture from a real site: course.service.ts:109-111
	const err = new CourseError("Course not found", "NOT_FOUND", undefined, { courseId: "c1" });
	handleServiceErrorSafely(err);
	expect(setContext).toHaveBeenCalledWith("domainError", { courseId: "c1" });
});
```

- [x] **Step 2: Run, expect FAIL.**

- [x] **Step 3: Implement.** `timingMiddleware` must be edited **in place** — it is a private `const`,
      so composing around it cannot close AC 40's "no timing line when the procedure throws" gap:

```ts
const timingMiddleware = t.middleware(async ({ next, path }) => {
	const start = Date.now();
	if (t._config.isDev) {
		const waitMs = Math.floor(Math.random() * 400) + 100;
		await new Promise((resolve) => setTimeout(resolve, waitMs));
	}
	try {
		const result = await next();
		logger.info(`[TRPC] ${path} took ${Date.now() - start}ms to execute`);
		return result;
	} catch (error) {
		logger.info(`[TRPC] ${path} took ${Date.now() - start}ms to execute (failed)`);
		if (shouldReport(error)) reportError(error, "trpc_procedure_failed", { path });
		throw error;
	}
});
```

`handleServiceError` enriches only, and does so through **`enrichScope` from the funnel** — it must
not import `@sentry/nextjs` itself (the Task 14 boundary scan will fail it if it does). The
`DomainError` branch keeps its message; only the *unmapped* branch changes:

```ts
// server/utils/handleServiceError.ts
import { enrichScope } from "@/server/observability/reportError";

export function handleServiceError(error: unknown): never {
	if (error instanceof TRPCError) throw error;

	if (error instanceof DomainError) {
		if (error.context) enrichScope("domainError", error.context);   // AC 3 — no-op when undefined
		throw new TRPCError({ code: error.code, message: error.message, cause: error.cause });
	}

	// AC 12: error.message is NOT copied. Three LangChain constructors put the entire
	// model output there, and this message reaches the browser.
	throw new TRPCError({
		code: "INTERNAL_SERVER_ERROR",
		message: "An unexpected error occurred",
		cause: error,
	});
}
```

Note the two `Error`/non-`Error` branches collapse into one — once the message is no longer copied,
they produce an identical `TRPCError`.

- [x] **Step 4: Spike to verify, before relying on it.** Confirm the RSC path (`createCaller`, not a
      route handler) is inside a Sentry-forked isolation scope. If it is **not**, wrap
      `trpc/server.ts:15-22`'s `createContext` in `Sentry.withIsolationScope()`. Do **not** add this
      defensively — an unnecessary fork drops context set before it. **If the spike says it is needed,
      export a `withRequestScope(fn)` wrapper from `server/observability/reportError.ts` and call that
      from `trpc/server.ts`** — do not import the SDK there, or the Task 14 boundary scan fails and the
      three-owner rule becomes four.

- [x] **Step 5: Run, expect PASS**; `pnpm typecheck`, `pnpm check`, `pnpm test:integration`.
- [x] **Step 6: Commit** — `feat(observability): capture tRPC errors once, enrich with domain context`

---

## Task 7: `safeRequest` + all 34 `lib/requests/**` call sites

**Files:**
- Create: `lib/requests/_shared/safeRequest.ts` + `.test.ts`,
  `lib/requests/_shared/noConsole.contract.test.ts`
- Modify: all 34 files under `lib/requests/**`

- [x] **Step 1: Write the failing tests**, including the AC 8 scan and its non-vacuity sibling.
- [x] **Step 2: Run, expect FAIL.**
- [x] **Step 3: Implement**, generic over the fallback because it is **not** uniformly `null`:

```ts
// lib/requests/_shared/safeRequest.ts
import "server-only";
import { reportError } from "@/server/observability/reportError";

export const safeRequest = async <T>(op: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
	try {
		return await fn();
	} catch (error) {
		reportError(error, `safeRequest:${op}`, { op });
		return fallback;
	}
};
```

- [x] **Step 4: Convert all 34 files.** Representative — `lib/requests/course/getEnrollmentStatus.ts`
      (the bare sub-shape, note the non-null fallback):

```ts
const getEnrollmentStatus = async (courseId: string) =>
	safeRequest("getEnrollmentStatus", () => api.course.getEnrollmentStatus(courseId), {
		isEnrolled: false,
		nextLessonId: null,
	});
```

      **Every fallback must be byte-identical to what the file returns today.** Diff each one.

- [x] **Step 5: Prove the scan non-vacuous** — reintroduce one `console.error`, run the scan, watch it
      fail, revert.
- [x] **Step 6: Run, expect PASS**; `pnpm typecheck`, `pnpm check`.
- [x] **Step 7: Commit** — `refactor(requests): route all 34 RSC fetchers through safeRequest`

---

## Task 8: `console.*` → `logger`, then the logger reporter

**Files:**
- Modify: `server/services/vercel/vercel.service.ts` (add the missing logger import),
  `app/api/chat/{lesson,learning-path,course}/route.ts`, `app/api/stripe/webhook/route.ts:80`,
  `app/api/uploads/route.ts:45`, `server/services/_shared/aiLimits/store/upstash.store.ts:118`,
  `server/utils/logger.ts`
- Create: `server/observability/noConsole.contract.test.ts`, `server/utils/logger.test.ts`

**Order matters:** the conversions land *before* the reporter. If the reporter went first, every
conversion in this task would start forwarding un-audited payloads mid-refactor.

- [x] **Step 1: Convert the `console.*` sites**, then add the AC 9 scan (`ROOTS` + `OWNERS` shape from
      `aiLimits.contract.test.ts:210-232`, `OWNERS` = `scripts/**`).
- [x] **Step 2: Prove it non-vacuous**, then revert.
- [x] **Step 3: Write the failing reporter test** — the reporter must normalise the three
      call-site argument shapes already in the codebase (message-first `user.service.ts:12`,
      error-first `guardUserInput.ts:103`, object-first `email.service.ts:62-66`) into
      `reportError(error, staticMessage, context)`, and must forward **only** `error` level (AC 5).
- [x] **Step 4: Implement the consola reporter** in `server/utils/logger.ts`.
- [x] **Step 5: Run, expect PASS**; `pnpm typecheck`, `pnpm check`.
- [x] **Step 6: Commit** — `feat(observability): forward logger.error to Sentry`

---

## Task 9: Close the AI-path leaks

**Files:**
- Modify: `server/services/lessonAI/lessonAI.service.ts:240`,
  `server/services/courseAI/graph/withNodeErrors.ts:21`,
  `app/api/chat/course/route.ts:216`
- Create: `server/observability/aiLogShape.contract.test.ts`

- [x] **Step 1: Write the failing tests** — AC 19 (class-only at every AI catch site), AC 20 (no model
      client or graph state passed to `logger.*`), AC 41 (aborts never reported, reusing the
      `expect(mockLogger.error).not.toHaveBeenCalled()` idiom from `withNodeErrors.test.ts:41-52`).
- [x] **Step 2: Run, expect FAIL.**
- [x] **Step 3: Implement.** `lessonAI.service.ts:240` logs `_error`'s class and **keeps swallowing** —
      the `finally` depends on it for `generator.return()` on abort. Resolve **S9's double-capture**:
      downgrade `withNodeErrors.ts:21` to a breadcrumb/`debug` so the courseAI SSE path reports once,
      not at 2× its failure rate.
- [x] **Step 4: Run, expect PASS**; `pnpm typecheck`, `pnpm check`.
- [x] **Step 5: Commit** — `fix(ai): log error classes only on AI failure paths`

---

## Task 10: The email PII fix

**Files:**
- Modify: `server/services/email/email.service.ts:62-66`
- Create: `server/observability/noPiiKeys.contract.test.ts`

- [x] **Step 1: Failing test** — the scan bans `email`/`toEmail`/`fromEmail`/`replyTo` as `logger.*`
      keys across `server/**` (AC 17), plus its non-vacuity sibling.
- [x] **Step 2: Run, expect FAIL** (the live site at `:63-64` is the offender).
- [x] **Step 3: Implement** — replace `toEmail` with `userId`, already present on `SendInput:16`.
- [x] **Step 4: Run, expect PASS**; `pnpm typecheck`, `pnpm check`.
- [x] **Step 5: Commit** — `fix(email): stop logging recipient addresses`

---

## Task 11: `CONFLICT` mapping for the two public procedures

**Files:**
- Modify: `server/services/auth/auth.service.ts:9-13`, `server/services/auth/auth.errors.ts`
- Test: `server/services/auth/auth.service.integration.test.ts`

One fix covers both AC 26 sites — `instructorService.createInstructor` calls the same
`authService.signUp`.

- [x] **Step 1: Failing test** — calling `user.signUp` twice with the same email yields `CONFLICT` and
      **zero** Sentry events; same for `instructor.create`.
- [x] **Step 2: Run, expect FAIL** (currently `INTERNAL_SERVER_ERROR`, because `AuthError` passes no
      code and `DomainError` defaults to it).
- [x] **Step 3: Implement** — `throw new AuthError("This email is already registered", "CONFLICT")`.
- [x] **Step 4: Add the AC 27 defence-in-depth test** — 1 000 anonymous collisions produce at most
      `SENTRY_MAX_PER_FINGERPRINT` events even if the mapping regresses.
- [x] **Step 5: Run, expect PASS**; `pnpm typecheck`, `pnpm check`, `pnpm test:integration`.
- [x] **Step 6: Commit** — `fix(auth): map duplicate-email signup to CONFLICT`

---

## Task 12: Security-event forwarding

**Files:**
- Modify: `server/services/_shared/aiGuard/securityLog.ts:11-24`
- Test: extend `server/services/_shared/aiGuard/securityLog.test.ts`

- [x] **Step 1: Failing tests** — the four zero-baseline outcomes call `reportMessage` with one
      fingerprint per outcome (AC 36); the other four produce **none** (AC 37); and the existing
      "never carries free text" test at `securityLog.test.ts:100-114` still passes against the new
      call. Mock `@/server/observability/reportError`, **not** `@sentry/nextjs` — if the test needs to
      mock the SDK here, the import boundary has already been broken.
- [x] **Step 2: Run, expect FAIL.**
- [x] **Step 3: Implement** via `reportMessage` (this file does **not** import `@sentry/nextjs`), with
      a **total record** so a ninth `SecurityOutcome` fails to compile (AC 37a):

```ts
if (FORWARD_TO_SENTRY[event.outcome]) {
	reportMessage(`aiGuard:${event.outcome}`, ["aiGuard", event.outcome], {
		feature: event.feature,
		userId: event.userId,
	});
}
```

```ts
const FORWARD_TO_SENTRY: Record<SecurityOutcome, boolean> = {
	unsafe_tool_call: true,
	fallback_triggered: true,
	mastery_write_retained: true,
	content_revised_retained: true,
	guard_blocked: false,
	guard_suspect: false,
	guard_off_topic: false,
	// Report-only, ~10% measured false-positive rate over every persisted
	// model-authored field — conformance/aiSurfaces.ts:72. Highest-volume
	// outcome in the taxonomy; forwarding it is the S6 flood pattern.
	output_validation_failed: false,
};
```

- [x] **Step 4: Run, expect PASS**; `pnpm typecheck`, `pnpm check`.
- [x] **Step 5: Commit** — `feat(aiGuard): forward zero-baseline security events to Sentry`

---

## Task 13: Error boundaries + the client-report server action

**Files:**
- Create: `server/entities/errorReport.ts`, `app/_components/ErrorBoundary/actions.ts`,
  `app/_components/ErrorBoundary/ErrorFallback/{index.tsx,types.ts}`, `app/error.tsx`,
  `app/global-error.tsx`
- Test: `server/entities/errorReport.test.ts`

- [x] **Step 1: Failing test** — the schema accepts `{ digest?, errorClass, route }` and **rejects**
      free text; oversized and extra fields are stripped. This schema *is* the control that stops a
      public write path becoming an arbitrary-text relay into the issue stream (AC 7, S5).
- [x] **Step 2: Run, expect FAIL.**
- [x] **Step 3: Implement.** ADR-011 conventions: one component per folder, colocated `types.ts`,
      arrow functions, and the mutation owned by `ErrorFallback` (not hoisted to `error.tsx`).
      `global-error.tsx` carries its own `<html><body>` per Next's convention. Throttle coverage is
      free — the action goes through `reportError`.
- [x] **Step 4: Run, expect PASS**; `pnpm typecheck`, `pnpm check`.
- [x] **Step 5: Commit** — `feat(app): add error boundaries reporting through a closed server action`

---

## Task 14: The build-time contract scans

**Files:**
- Create: `server/observability/buildConfig.contract.test.ts`
- Create: `scripts/check-build-artifacts.ts`

- [x] **Step 1: Failing tests** — AC 29 (`SENTRY_AUTH_TOKEN` appears only in `next.config.ts`), AC 33
      (no `Sentry.startSpan` / `startTransaction` anywhere), AC 34 (`tunnelRoute` absent), AC 35
      (`deleteSourcemapsAfterUpload: true` and `widenClientFileUpload: false` present verbatim), and
      **the import boundary**:

```ts
// server/observability/importBoundary.contract.test.ts
// The projection is the enforcement point for AC 10/11. A module that imports the SDK
// directly can call captureException(realError) and put OutputParserException.message —
// the entire model output — into the Sentry issue title, bypassing the projection, the
// AC 2 dedup marker and the AC 41 abort filter. So the boundary is scanned, not trusted.
const OWNERS = [
	"sentry.server.config.ts",
	"instrumentation.ts",
	"server/observability/reportError.ts",
];

it("only the three owner files import the Sentry SDK", () => {
	const offenders = ["server", "app", "lib", "trpc", "scripts"]
		.filter((root) => existsSync(root))
		.flatMap((root) => walk(root))
		.filter((f) => !f.endsWith(".test.ts") && !OWNERS.includes(f))
		.filter((f) => /from\s+["']@sentry\/nextjs["']/.test(code(f)));

	expect(offenders, offenders.join("\n")).toEqual([]);
});

it("finds the owners at all — the scan is not vacuous", () => {
	expect(OWNERS.filter((f) => /@sentry\/nextjs/.test(code(f))).length).toBe(3);
});
```
- [x] **Step 2: Run, expect FAIL** if any wizard default survived Task 1 — which is the point of
      running these last.
- [x] **Step 3: Implement** the scans plus `scripts/check-build-artifacts.ts`: after `pnpm build`,
      assert no `.map` under `.next/static` and that the auth-token string appears nowhere in `.next/`.
- [x] **Step 4: Run, expect PASS**; `pnpm typecheck`, `pnpm check`.
- [x] **Step 5: Commit** — `test(observability): pin build-time Sentry configuration`

---

## Task 15: Availability — reporting is never in the critical path

**Files:**
- Test: `server/observability/availability.integration.test.ts`

- [x] **Step 1: Write the test** (AC 38/39) — stub the transport to hang indefinitely, then assert a
      tRPC procedure and one SSE turn complete with unchanged latency and unchanged output. This is
      what turns "reporting is best-effort" from a claim into a fact.
- [x] **Step 2: Run.** If it fails, the fix is in `reportError`/config, not the test.
- [x] **Step 3: Assert no `Sentry.flush()` appears inside any `ReadableStream` body** —
      a source scan over `app/api/chat/**`.
- [x] **Step 4: Commit** — `test(observability): prove reporting cannot stall a request`

---

## Self-review (run before handoff)

| AC | Task | AC | Task | AC | Task |
|---|---|---|---|---|---|
| 1 | 6 | 15 | 2 | 29 | 1, 14 |
| 2 | 3, 5 | 16 | 3 | 30 | 4, 5 |
| 3 | 6 | 17 | 10 | 31 | 4 |
| 4 | 6 | 18 | 5 | 32 | 5 |
| 5 | 8 | 19 | 9 | 33 | 5, 14 |
| 6 | 5 | 20 | 9 | 34 | 1, 14 |
| 7 | 13 | 21 | 2, 3 | 35 | 1, 14 |
| 8 | 7 | 22 | 3 | 36 | 12 |
| 9 | 8 | 23 | 3 | 37 | 12 |
| 10 | 2 | 24 | 3 | 37a | 12 |
| 11 | 2, 5 | 25 | 3 | 38 | 15 |
| 12 | 6 | 26 | 11 | 39 | 15 |
| 13 | 2 | 27 | 11 | 40 | 6 |
| 14 | 2 | 28 | 1 | 41 | 5, 9 |
| | | | | 42 | all |

**Security controls (`security.md` S1–S16) → task:** S2 → 2, 6, 9 · S3 → 10 · S4 → 3 · S5 → 1, 13 ·
S6 → 3 · S7 → 11 · S8 → 4, 5 · S9 → 3, 5, 9 · S10 → 15 · S11 → 1, 14 · S12 → 12 · S13 → `/qa` doc
update (accepted residual, no code) · S14 → 1 (`sdk-defaults.md`), 5 (pinned integrations) ·
S15 → 9 (accepted) · S16 → `/qa` doc update (named gap, no code).

- **Placeholder scan:** no `TBD`/`TODO`/"handle edge cases" in any code step.
- **Type consistency:** `ProjectionContext`, `reportError`, `safeRequest`, `isCaptured`,
  `shouldThrottle`, `resolveSentryDsn`, `FORWARD_TO_SENTRY` are used identically across tasks.
- **Known open item carried into execution:** Task 6 Step 4's isolation-scope spike. If the RSC path
  is not auto-forked, `trpc/server.ts` gains an explicit `withIsolationScope` — the only design point
  this plan leaves to a measurement rather than settling on paper.

## Final verification

- `pnpm typecheck`, `pnpm check`, `pnpm test:unit`, `pnpm test:integration` — all green (AC 42).
- `SENTRY_DSN= pnpm build` succeeds (AC 28); `NODE_ENV=production` without a DSN throws at boot (AC 30).
- `pnpm build && tsx scripts/check-build-artifacts.ts` — no `.map` under `.next/static`, no auth token
  in `.next/` (AC 29, 35).
- **Manual, against a real DSN:** throw from a `lib/requests/**` call, a tRPC procedure, an RSC render,
  and a client boundary — four distinct, correctly-grouped issues, **no PII in any payload**, and each
  reported exactly once.
- **Manual redaction review:** trigger a `lessonInsightsAI` parse failure and confirm the Sentry issue
  title is the static message, not the model output.