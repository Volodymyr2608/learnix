import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { takeRecordedUsage } from "./cost";
import { type EvalCall, summariseCalls, usageRecorder } from "./usage";

/**
 * A `courseAI` node returns its parsed structured output, not the message that
 * carried it — so `recordUsage(MODEL, usageOfMessage(message))`, the pattern
 * `lessonAI/tutor.eval.ts` uses, has nothing to read. The usage arrives only on
 * the callback, which is why this exists at all.
 *
 * The recorder is driven directly here rather than through a live call: what
 * needs pinning is the bookkeeping, and a real call would price it in dollars
 * per run.
 */

const start = (
	recorder: ReturnType<typeof usageRecorder>,
	runId: string,
	model = "gpt-4o-mini",
): void => {
	recorder.handler.handleChatModelStart?.(
		{ lc: 1, type: "not_implemented", id: [] },
		[],
		runId,
		undefined,
		{ invocation_params: { model } },
	);
};

const end = (
	recorder: ReturnType<typeof usageRecorder>,
	runId: string,
	usage: { input_tokens: number; output_tokens: number } | undefined,
): void => {
	recorder.handler.handleLLMEnd?.(
		{
			generations: [
				[{ text: "", message: usage ? { usage_metadata: usage } : {} }],
			],
		} as never,
		runId,
	);
};

beforeEach(() => {
	// `recordUsage` is a module-global side channel shared with every other eval
	// in the process; a leftover from a previous case would be read as this
	// run's spend.
	takeRecordedUsage();
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe("usageRecorder", () => {
	it("records one call per model call, with tokens from usage_metadata", () => {
		const recorder = usageRecorder();

		start(recorder, "a");
		end(recorder, "a", { input_tokens: 1200, output_tokens: 30 });

		expect(recorder.takeCalls()).toEqual([
			{
				model: "gpt-4o-mini",
				latencyMs: 0,
				inputTokens: 1200,
				outputTokens: 30,
			},
		]);
	});

	it("reads the model that actually ran rather than one the eval assumes", () => {
		const recorder = usageRecorder();

		start(recorder, "a", "gpt-4o");
		end(recorder, "a", { input_tokens: 10, output_tokens: 1 });

		expect(recorder.takeCalls()[0]?.model).toBe("gpt-4o");
	});

	it("feeds the run aggregator, so formatRunCost prices the whole eval", () => {
		const recorder = usageRecorder();

		start(recorder, "a");
		end(recorder, "a", { input_tokens: 100, output_tokens: 10 });
		start(recorder, "b");
		end(recorder, "b", { input_tokens: 200, output_tokens: 20 });

		expect(takeRecordedUsage()).toEqual([
			{
				model: "gpt-4o-mini",
				calls: 2,
				usage: { inputTokens: 300, outputTokens: 30 },
			},
		]);
	});

	/**
	 * Rows run concurrently through `Promise.all`, so wall clock over the run
	 * divided by row count is not the latency of a call — it is the latency of
	 * the slowest overlap. Each call is timed on its own.
	 */
	it("times each call separately when calls overlap", () => {
		const recorder = usageRecorder();

		start(recorder, "slow");
		vi.advanceTimersByTime(300);
		start(recorder, "fast");
		vi.advanceTimersByTime(200);
		end(recorder, "fast", { input_tokens: 1, output_tokens: 1 });
		vi.advanceTimersByTime(1000);
		end(recorder, "slow", { input_tokens: 1, output_tokens: 1 });

		const byLatency = recorder.takeCalls().map((call) => call.latencyMs);

		expect(byLatency).toEqual([200, 1500]);
	});

	/**
	 * A provider that reports no usage still cost time and money. Dropping the
	 * call would silently shrink the denominator of every mean computed here —
	 * the same defect `aiMetrics` forbids as "a silent $0.00 is not a default".
	 */
	it("counts a call whose provider reported no usage, at zero tokens", () => {
		const recorder = usageRecorder();

		start(recorder, "a");
		end(recorder, "a", undefined);

		expect(recorder.takeCalls()).toEqual([
			{ model: "gpt-4o-mini", latencyMs: 0, inputTokens: 0, outputTokens: 0 },
		]);
	});

	it("ignores an end with no matching start instead of throwing mid-run", () => {
		const recorder = usageRecorder();

		expect(() => {
			end(recorder, "never-started", { input_tokens: 5, output_tokens: 1 });
		}).not.toThrow();
		expect(recorder.takeCalls()).toEqual([]);
	});

	it("empties on take, so a second read is not the first run again", () => {
		const recorder = usageRecorder();

		start(recorder, "a");
		end(recorder, "a", { input_tokens: 5, output_tokens: 1 });

		expect(recorder.takeCalls()).toHaveLength(1);
		expect(recorder.takeCalls()).toEqual([]);
	});
});

describe("summariseCalls", () => {
	const call = (latencyMs: number, inputTokens = 100): EvalCall => ({
		model: "gpt-4o-mini",
		latencyMs,
		inputTokens,
		outputTokens: 10,
	});

	it("reports the mean prompt size, which is what a prompt change moves", () => {
		expect(
			summariseCalls([call(10, 1000), call(10, 2000), call(10, 3000)])
				.meanPromptTokens,
		).toBe(2000);
	});

	/**
	 * The mean is reported next to p95 on purpose: a suite whose mean holds
	 * while its tail doubles has got worse, and only one of the two numbers
	 * says so.
	 */
	it("reports p95 by nearest rank, not the mean", () => {
		const calls = Array.from({ length: 20 }, (_, i) => call((i + 1) * 100));

		const summary = summariseCalls(calls);

		expect(summary.meanLatencyMs).toBe(1050);
		// Nearest rank over 20 samples is the 19th — the second-slowest call.
		expect(summary.p95LatencyMs).toBe(1900);
	});

	it("is empty rather than NaN for a run that made no call", () => {
		expect(summariseCalls([])).toEqual({
			calls: 0,
			meanPromptTokens: 0,
			meanCompletionTokens: 0,
			meanLatencyMs: 0,
			p95LatencyMs: 0,
		});
	});
});
