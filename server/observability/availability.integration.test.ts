import * as Sentry from "@sentry/nextjs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createCallerFactory,
	createTRPCRouter,
	publicProcedure,
} from "@/server/api/trpc";
import { makeUser } from "@/test/factories";

/**
 * spec.md AC 38/39. `reportError`/`reportMessage` (server/observability/reportError.ts)
 * call `Sentry.captureException`/`captureMessage` and never `await` them — the SDK
 * queues the event and does its own network I/O off the critical path, by design.
 * `sentry.server.config.ts` bounds the one place that *would* wait
 * (`shutdownTimeout: 2`). This file turns that design claim into a fact: with a
 * transport that never resolves, a real tRPC procedure call and a real SSE turn both
 * still complete in milliseconds, with unchanged output.
 *
 * Why a stubbed transport, not a mocked `captureException`: mocking the capture call
 * away would prove nothing about timing — it removes the exact code path AC 38/39
 * makes a claim about. This needs the real SDK to genuinely attempt to send an event
 * over a transport that hangs.
 *
 * Why this can't just rely on `sentry.server.config.ts`: that file is reached only
 * through instrumentation.ts's `register()`, which Next calls at server boot —
 * vitest never triggers it. `SENTRY_DSN` is also unset here (test/loadEnv.ts,
 * resolveSentryDsn's allowlist for "test"), so even if it ran, `Sentry.init` would
 * bind `dsn: undefined` and the client would be disabled — captureException would be
 * a no-op, and this test would be vacuous by construction. So this file wires its own
 * client, scoped to this file only, entirely from the test side: `Sentry.init`'s
 * `transport` option is a factory the SDK calls with the options it would otherwise
 * hand to `makeNodeTransport`. Swapping in a transport whose `send()` returns a
 * promise that never resolves reproduces "the ingest host is unreachable" without any
 * real network I/O, and without touching `sentry.server.config.ts` or
 * `reportError.ts` — both already reviewed and settled.
 *
 * Each integration test file runs isolated (vitest's default per-file isolation), so
 * this client and its hung sends do not leak into any other test file.
 */

const {
	mockGetSession,
	mockCheckTopicRelevance,
	mockRunChat,
	mockGetOrCreate,
} = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockCheckTopicRelevance: vi.fn(),
	mockRunChat: vi.fn(),
	mockGetOrCreate: vi.fn(),
}));

vi.mock("@/server/better-auth/server", () => ({ getSession: mockGetSession }));
vi.mock("@/server/services/_shared/aiGuard/topicRelevance", () => ({
	checkTopicRelevance: mockCheckTopicRelevance,
}));
vi.mock("@/server/services/courseAI/courseAI.service", () => ({
	courseAIService: {
		getOrCreateCourseGeneration: mockGetOrCreate,
		runChat: mockRunChat,
		runFinalize: vi.fn(),
		saveMessage: vi.fn().mockResolvedValue(undefined),
	},
}));

const { POST } = await import("@/app/api/chat/course/route");
const { RetryableNodeError } = await import(
	"@/server/services/courseAI/courseAI.errors"
);

const readSse = async (res: Response): Promise<string> =>
	res.body ? await new Response(res.body).text() : "";

let sendCount = 0;

beforeAll(() => {
	Sentry.initWithoutDefaultIntegrations({
		dsn: "https://examplePublicKey@o0.ingest.sentry.io/0",
		tracesSampleRate: 0,
		sendDefaultPii: false,
		integrations: [],
		transport: (transportOptions) =>
			Sentry.createTransport(transportOptions, () => {
				sendCount += 1;
				// Never resolves or rejects — simulates an unreachable ingest host.
				// `reportError` never awaits this, so nothing downstream should
				// observe it as anything other than instantaneous.
				return new Promise(() => {});
			}),
	});
});

/** Well under vitest's 5s default test timeout. If `reportError`, the tRPC
 * middleware, or the SSE route ever started awaiting the capture call, the request
 * would hang toward that timeout instead of finishing in milliseconds — this bound
 * is what turns that regression into a clear, fast test failure rather than a
 * five-second one. */
const MAX_LATENCY_MS = 1_000;

describe("reporting cannot stall a request while the transport hangs (AC 38/39)", () => {
	describe("a real tRPC procedure through the real middleware chain", () => {
		const testRouter = createTRPCRouter({
			throwsUnmapped: publicProcedure.query(() => {
				throw new Error(
					"deliberate unmapped failure for availability.integration.test.ts",
				);
			}),
		});
		const createCaller = createCallerFactory(testRouter);
		const ctx = {
			db: {} as never,
			headers: new Headers(),
			session: null,
		} as never;

		it("completes with unchanged latency and unchanged output", async () => {
			const before = sendCount;
			const start = Date.now();

			await expect(createCaller(ctx).throwsUnmapped()).rejects.toThrow(
				"deliberate unmapped failure for availability.integration.test.ts",
			);

			expect(Date.now() - start).toBeLessThan(MAX_LATENCY_MS);
			// The hanging transport was actually exercised, not skipped — otherwise
			// the latency assertion above would be proving nothing.
			expect(sendCount).toBeGreaterThan(before);
		});
	});

	describe("a real SSE turn (app/api/chat/course/route.ts)", () => {
		beforeEach(async () => {
			vi.clearAllMocks();
			const instructor = await makeUser({ role: "INSTRUCTOR" });
			mockGetSession.mockResolvedValue({
				user: { id: instructor.id, role: "INSTRUCTOR" },
			});
			mockCheckTopicRelevance.mockResolvedValue({
				onTopic: true,
				reason: "course design",
			});
			mockGetOrCreate.mockResolvedValue({ id: "gen-1", step: "BASIC" });

			// route.nodeErrors.integration.test.ts's pattern: the route consumes
			// runChat's result with `for await`, so failing on the first `next()`
			// is exactly how a node error surfaces mid-stream. This is the same
			// path logger.error/reportError/Sentry.captureException fires through
			// (route.ts's catch block -> logger.error -> the reporter in
			// server/utils/logger.ts).
			mockRunChat.mockImplementation(async () => ({
				[Symbol.asyncIterator]: () => ({
					next: () =>
						Promise.reject(
							new RetryableNodeError(
								'[courseAI.graph] node "chat_response" failed',
								"SERVICE_UNAVAILABLE",
								new Error("upstream boom"),
							),
						),
				}),
			}));
		});

		it("completes with unchanged latency and unchanged output", async () => {
			const before = sendCount;
			const start = Date.now();

			const res = await POST(
				new Request("http://localhost/api/chat/course", {
					method: "POST",
					body: JSON.stringify({
						userMessage: "Let's call the course Intro to Python.",
						mode: "chat",
					}),
				}),
			);
			const body = await readSse(res);

			expect(Date.now() - start).toBeLessThan(MAX_LATENCY_MS);
			// Same output shape as route.nodeErrors.integration.test.ts's baseline
			// (no hung transport there) — a retryable node failure, reported once,
			// streamed once, with try-again copy.
			expect(body).toContain('"type":"error"');
			expect(body).toContain('"retryable":true');
			expect(body).toContain("try again");
			expect(sendCount).toBeGreaterThan(before);
		});
	});
});
