import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLogger, mockFindMany, mockStreamEvents } = vi.hoisted(() => ({
	mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
	mockFindMany: vi.fn().mockResolvedValue([]),
	mockStreamEvents: vi.fn(),
}));

vi.mock("@/server/utils/logger", () => ({ logger: mockLogger }));
vi.mock("@/server/repositories/courseGenerationMessage.repository", () => ({
	courseGenerationMessageRepository: { findMany: mockFindMany },
}));
vi.mock("@/server/repositories/courseGeneration.repository", () => ({
	courseGenerationRepository: {},
}));
vi.mock("@/server/services/courseAI/graph/graph", () => ({
	courseBuilderGraph: { streamEvents: mockStreamEvents },
}));

const { courseAIService } = await import(
	"@/server/services/courseAI/courseAI.service"
);

/**
 * spec.md AC 3 / AC 14. The point being proved here is not that a line appears —
 * handler.test.ts covers that — but that the handler REACHES the graph through
 * the config, which is what lets every node be metered without any node being
 * touched.
 */

const generation = {
	id: "gen-1",
	instructorId: "instructor-1",
	step: "BASICS",
	content: {},
} as never;

const emptyStream = () =>
	(async function* () {
		yield { event: "on_chain_start", name: "classify_intent" };
	})();

const turnLines = () =>
	mockLogger.info.mock.calls
		.map(([fields]) => fields as Record<string, unknown>)
		.filter((f) => "calls" in f);

beforeEach(() => {
	mockLogger.info.mockClear();
	mockStreamEvents.mockReset().mockReturnValue(emptyStream());
});

describe("the handler reaches the graph through the config (AC 3)", () => {
	it("passes a callbacks array on runChat", async () => {
		const stream = await courseAIService.runChat({
			courseGeneration: generation,
			userMessage: "hello",
		});
		for await (const _ of stream) {
			// drain
		}

		const [, config] = mockStreamEvents.mock.calls[0] ?? [];
		expect(Array.isArray((config as { callbacks?: unknown }).callbacks)).toBe(
			true,
		);
	});

	it("passes a callbacks array on runFinalize", async () => {
		const stream = await courseAIService.runFinalize({
			courseGeneration: generation,
		});
		for await (const _ of stream) {
			// drain
		}

		const [, config] = mockStreamEvents.mock.calls[0] ?? [];
		expect(Array.isArray((config as { callbacks?: unknown }).callbacks)).toBe(
			true,
		);
	});

	it("keeps the bounds it already passed — the meter adds, never replaces", async () => {
		// recursionLimit and the turn deadline are the existing resource controls
		// on this path; a config rebuilt around callbacks could silently drop them.
		const stream = await courseAIService.runChat({
			courseGeneration: generation,
			userMessage: "hello",
		});
		for await (const _ of stream) {
			// drain
		}

		const [, config] = mockStreamEvents.mock.calls[0] ?? [];
		expect(config).toMatchObject({
			version: "v2",
			recursionLimit: expect.any(Number),
			configurable: { instructorId: "instructor-1" },
		});
		expect((config as { signal?: unknown }).signal).toBeDefined();
	});
});

describe("the turn is summarised on every exit (AC 5)", () => {
	it("emits one summary after a normal run", async () => {
		const stream = await courseAIService.runChat({
			courseGeneration: generation,
			userMessage: "hello",
		});
		for await (const _ of stream) {
			// drain
		}

		expect(turnLines()).toHaveLength(1);
		expect(turnLines()[0]).toMatchObject({ feature: "courseAI", calls: 0 });
	});

	it("emits a summary when the graph throws, and rethrows", async () => {
		mockStreamEvents.mockReturnValue(
			(async function* () {
				yield { event: "on_chain_start", name: "classify_intent" };
				throw Object.assign(new Error("provider down"), {
					name: "TimeoutError",
				});
			})(),
		);

		const stream = await courseAIService.runChat({
			courseGeneration: generation,
			userMessage: "hello",
		});

		await expect(
			(async () => {
				for await (const _ of stream) {
					// drain
				}
			})(),
		).rejects.toThrow();

		expect(turnLines()[0]).toMatchObject({ outcome: "retryable_error" });
	});

	it("emits a summary when the consumer abandons the stream mid-way", async () => {
		// The route breaks its for-await the moment the signal trips, which
		// unwinds the generator from its suspended yield. Only `finally` survives
		// that — the same reason lessonAI's abort handling lives in one.
		mockStreamEvents.mockReturnValue(
			(async function* () {
				yield { event: "a" };
				yield { event: "b" };
			})(),
		);

		const stream = await courseAIService.runChat({
			courseGeneration: generation,
			userMessage: "hello",
		});
		for await (const _ of stream) {
			break;
		}

		expect(turnLines()).toHaveLength(1);
	});
});
