// Set NODE_ENV to production so timingMiddleware skips the artificial delay
// (matches the convention in aiRateLimit.middleware.integration.test.ts and
// auth.service.integration.test.ts).
Object.assign(process.env, { NODE_ENV: "production" });

import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	createCallerFactory,
	createTRPCRouter,
	publicProcedure,
} from "@/server/api/trpc";
import { logger } from "@/server/utils/logger";

const { captureException, setTag, setContext } = vi.hoisted(() => ({
	captureException: vi.fn(),
	setTag: vi.fn(),
	setContext: vi.fn(),
}));

vi.mock("@sentry/nextjs", async (importOriginal) => ({
	...(await importOriginal<object>()),
	captureException,
	getIsolationScope: () => ({ setTag, setContext }),
}));

// safeRequest.ts has a top-level `import "server-only"`, which unconditionally
// throws unless the bundler resolves the package's "react-server" export
// condition (Next.js sets that; plain Node/vitest does not). Stub it to a
// no-op so the Finding 2 describe block below can import the real module.
vi.mock("server-only", () => ({}));

const { safeRequest } = await import("@/lib/requests/_shared/safeRequest");

/**
 * Dedicated, discoverable regression coverage for commit 93362f3
 * ("report tRPC failures via next()'s result, not a dead try/catch").
 *
 * Before that fix, timingMiddleware wrapped `await next()` in a try/catch
 * that never actually caught anything: @trpc/server@11's next() resolves to
 * `{ ok: false, error }` instead of rejecting on a downstream throw, so the
 * catch block was 100% dead code and reportError had never fired for a
 * single real tRPC procedure failure since this middleware was written.
 *
 * These tests exercise a REAL procedure through the REAL middleware chain —
 * next() and timingMiddleware are not mocked — so a regression back to the
 * try/catch shape fails these tests directly, without relying on
 * server/services/auth/auth.service.integration.test.ts (AC 27's duplicate-
 * signup throttle test), which happens to also cover this path but gives no
 * hint of that in its name, location, or comments.
 */
const testRouter = createTRPCRouter({
	throwsUnmapped: publicProcedure.query(() => {
		throw new Error("deliberate unmapped failure for trpc.integration.test.ts");
	}),
	throwsUnauthorized: publicProcedure.query(() => {
		throw new TRPCError({ code: "UNAUTHORIZED" });
	}),
});

const createCaller = createCallerFactory(testRouter);
const ctx = { db: {} as never, headers: new Headers(), session: null } as never;

describe("timingMiddleware reports real procedure failures (regression for 93362f3)", () => {
	beforeEach(() => {
		captureException.mockClear();
		setTag.mockClear();
		setContext.mockClear();
	});

	it("an unmapped thrown error reaches Sentry exactly once through the real middleware chain (AC 1/2/40)", async () => {
		await expect(createCaller(ctx).throwsUnmapped()).rejects.toThrow();

		expect(captureException).toHaveBeenCalledTimes(1);
	});

	it("logs the failure-branch timing line for a real thrown error (AC 40)", async () => {
		const infoSpy = vi.spyOn(logger, "info");

		await createCaller(ctx)
			.throwsUnmapped()
			.catch(() => undefined);

		const loggedFailureLine = infoSpy.mock.calls.some(
			([message]) =>
				typeof message === "string" &&
				/took \d+ms to execute \(failed\)/.test(message),
		);
		expect(loggedFailureLine).toBe(true);

		infoSpy.mockRestore();
	});

	it("a client-fault code (UNAUTHORIZED) reports zero Sentry events (AC 4)", async () => {
		await expect(createCaller(ctx).throwsUnauthorized()).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});

		expect(captureException).not.toHaveBeenCalled();
	});
});

/**
 * Finding 2 / spec.md AC 2: "An error captured by the tRPC middleware is
 * marked (a non-enumerable __sentryCaptured), and safeRequest attaches its
 * operation tag to that existing event rather than capturing a second one."
 *
 * lib/requests/** calls createCaller, so every one of the 34 RSC fetchers
 * reaches a procedure through the SAME real middleware chain tested above,
 * then safeRequest catches whatever escapes it. This is the only test that
 * drives a real safeRequest(...) around a real createCaller(...) call to a
 * real throwing procedure end to end and asserts a single Sentry event.
 */
describe("safeRequest dedups the tRPC middleware's capture (AC 2)", () => {
	beforeEach(() => {
		captureException.mockClear();
		setTag.mockClear();
		setContext.mockClear();
	});

	it("a real throwing procedure reached through safeRequest produces exactly one event, tagged with the operation", async () => {
		const fallback = { ok: false } as const;

		const result = await safeRequest(
			"trpcIntegrationTest:throwsUnmapped",
			() => createCaller(ctx).throwsUnmapped(),
			fallback,
		);

		expect(result).toBe(fallback);
		expect(captureException).toHaveBeenCalledTimes(1);
		expect(setTag).toHaveBeenCalledWith(
			"operation",
			"trpcIntegrationTest:throwsUnmapped",
		);
	});
});
