/**
 * Token accounting for evals that call a graph NODE rather than a model.
 *
 * `lessonAI/tutor.eval.ts` reads usage straight off the messages the agent
 * returns. A `courseAI` node cannot be read that way: `confidenceScore` returns
 * `{ confidence, shouldAutoAdvance }` — the parsed structured output — and the
 * message that carried `usage_metadata` is gone by the time the eval sees a
 * result. The callback is the only surface where the usage still exists.
 *
 * This is the eval-side twin of `server/services/_shared/aiMetrics/handler.ts`
 * and deliberately not a copy of it: the production handler writes log lines and
 * totals a turn, while an eval needs the per-call rows to average. What the two
 * share — the price table, the `usage_metadata` reader, the model-label reader —
 * is imported from the one place that owns it, for the reason ADR-035 gives:
 * two readers drift, and the two answers then disagree without either looking
 * wrong.
 */

import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { Serialized } from "@langchain/core/load/serializable";
import type { LLMResult } from "@langchain/core/outputs";
import { modelOf } from "@/server/services/_shared/aiMetrics/pricing";
import {
	formatRunCost,
	recordUsage,
	takeRecordedUsage,
	usageOfMessage,
} from "./cost";

export type EvalCall = {
	model: string;
	latencyMs: number;
	inputTokens: number;
	outputTokens: number;
};

/**
 * `_awaitHandler: true` is load-bearing, and the reason is the defect ADR-035
 * calls the callback-ordering hazard: by default LangChain hands every hook to a
 * process-global queue of concurrency 1 without awaiting it, so `handleLLMEnd`
 * runs at some point AFTER the call it belongs to resolved. In an eval that
 * fires every row through `Promise.all`, that costs twice — rows finish before
 * their own usage is booked, and each `latencyMs` measures when the queue got
 * around to the row rather than what the provider took.
 *
 * Awaiting is safe here for the same reason it was rejected in production: it
 * moves the bookkeeping inline into the model call. Inline is wrong when the
 * call is a student's 3s guard budget, and right when the caller is a suite
 * whose whole purpose is to measure that call.
 */
class EvalUsageHandler extends BaseCallbackHandler {
	name = "evalUsage";

	private readonly open = new Map<
		string,
		{ startedAt: number; model: string }
	>();
	private calls: EvalCall[] = [];

	constructor() {
		super({ _awaitHandler: true });
	}

	handleChatModelStart(
		_llm: Serialized,
		_messages: unknown[][],
		runId: string,
		_parentRunId?: string,
		extraParams?: Record<string, unknown>,
	): void {
		this.open.set(runId, {
			startedAt: Date.now(),
			model: modelOf(extraParams),
		});
	}

	handleLLMEnd(output: LLMResult, runId: string): void {
		const call = this.open.get(runId);
		// An end with no start is not this recorder's call — dropping it is what
		// keeps a shared process from booking another eval's spend here.
		if (!call) return;
		this.open.delete(runId);

		const message = (
			output.generations?.[0]?.[0] as { message?: unknown } | undefined
		)?.message;
		const usage = usageOfMessage(message);

		// Both, not either: `recordUsage` totals the run for `formatRunCost`, the
		// row is what a mean is computed from. A call the provider reported no
		// usage for is still recorded — at zero tokens, never dropped, because a
		// dropped row shrinks the denominator of every mean silently.
		recordUsage(call.model, usage);
		this.calls.push({
			model: call.model,
			latencyMs: Date.now() - call.startedAt,
			inputTokens: usage.inputTokens,
			outputTokens: usage.outputTokens,
		});
	}

	/**
	 * A call that threw is booked at zero tokens, for the same reason a call the
	 * provider reported no usage for is: dropping it shrinks the denominator of
	 * every mean without saying so, and a 30s timeout with two retries is a
	 * ninety-second, fully-paid event that would vanish from `meanLatencyMs`
	 * entirely. The production twin refuses the same drop (`handler.ts`): a
	 * failed call is still a call.
	 */
	handleLLMError(_error: unknown, runId: string): void {
		const call = this.open.get(runId);
		if (!call) return;
		this.open.delete(runId);

		this.calls.push({
			model: call.model,
			latencyMs: Date.now() - call.startedAt,
			inputTokens: 0,
			outputTokens: 0,
		});
	}

	/** Calls that started and never ended: spend no line would otherwise admit to. */
	openCalls(): number {
		return this.open.size;
	}

	/** How many calls are booked, without emptying the book. */
	countCalls(): number {
		return this.calls.length;
	}

	takeCalls(): EvalCall[] {
		const taken = this.calls;
		this.calls = [];
		return taken;
	}
}

export const usageRecorder = () => {
	const handler = new EvalUsageHandler();

	return {
		handler,
		/** Pass as a node's `RunnableConfig`: `confidenceScore(state, recorder.config)`. */
		config: { callbacks: [handler] },
		/** Empties, so a second read is not the first run counted twice. */
		takeCalls: (): EvalCall[] => handler.takeCalls(),
		/**
		 * Does NOT empty — the count a coverage check needs before
		 * `reportRunUsage` drains the book. Reading it with `takeCalls` would
		 * leave the cost line reporting a run that recorded nothing.
		 */
		countCalls: (): number => handler.countCalls(),
		/** Started and never ended — neither `handleLLMEnd` nor `handleLLMError` fired. */
		openCalls: (): number => handler.openCalls(),
	};
};

export type CallSummary = {
	calls: number;
	meanPromptTokens: number;
	meanCompletionTokens: number;
	meanLatencyMs: number;
	p95LatencyMs: number;
};

const mean = (values: readonly number[]): number =>
	values.length === 0
		? 0
		: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);

/**
 * Nearest rank: the smallest observed value at or above the 95th percentile,
 * never an interpolation between two calls that never happened. Read the index
 * before quoting the number — on the sample sizes an eval produces it moves:
 * `ceil(n × 0.95) - 1` is the 19th of 20 calls (the second-slowest) but the
 * 19th of 19 (the slowest). Saying which call it names is more honest than a
 * smoothed number that names none.
 */
const p95 = (values: readonly number[]): number => {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0;
};

export const summariseCalls = (calls: readonly EvalCall[]): CallSummary => ({
	calls: calls.length,
	meanPromptTokens: mean(calls.map((call) => call.inputTokens)),
	meanCompletionTokens: mean(calls.map((call) => call.outputTokens)),
	meanLatencyMs: mean(calls.map((call) => call.latencyMs)),
	p95LatencyMs: p95(calls.map((call) => call.latencyMs)),
});

/**
 * Did the run actually call the model as many times as its score claims?
 *
 * This is P2 stated as a check. `assessCompletion` hardcoded an empty user
 * message, the node returned on its first line, every prediction came back
 * `false`, and the empty-set branch of `precisionGate` returned 1 — so the run
 * printed "100.0%" over **zero** model calls. Nothing in the harness connected
 * the score to the measurement having happened, and three defects of that class
 * landed in three days: a leaked label, a prompt failing its own gate, and this.
 *
 * A shortfall is a defect: a sample that never reached the provider was scored
 * against something other than the model. A surplus is a retry — real spend,
 * worth naming on the line, and no reason to fail a run.
 */
export const callCoverage = (
	calls: number,
	claimedSamples: number,
): { ok: boolean; message: string } => {
	if (calls < claimedSamples)
		return {
			ok: false,
			message:
				`${calls} model calls for ${claimedSamples} scored samples — ` +
				`${claimedSamples - calls} never reached the provider, so their score is not the model's`,
		};

	if (calls > claimedSamples)
		return {
			ok: true,
			message:
				`${calls} model calls for ${claimedSamples} scored samples — ` +
				`${calls - claimedSamples} retried`,
		};

	return { ok: true, message: "" };
};

/**
 * One terminal line, in the shape `formatRunCost` prints its own.
 *
 * `concurrency` is not decoration. An eval fires its rows through `Promise.all`,
 * so these latencies carry the provider's queueing under that many simultaneous
 * requests and are **not** a production per-call number; printing the width is
 * what stops the two being read as the same measurement.
 *
 * Zero calls says so in words rather than printing `0 calls  mean 0ms`, which
 * is what a recorder wired into nothing looks like — indistinguishable, on that
 * line alone, from a run that was free.
 */
export const formatCallStats = (
	summary: CallSummary,
	concurrency?: number,
): string => {
	if (summary.calls === 0) {
		return `  ${"per call".padEnd(14)} no model calls recorded — is the recorder wired into the node's config?`;
	}

	const width = concurrency === undefined ? "" : `  @${concurrency}-way`;

	return (
		`  ${"per call".padEnd(14)} ${String(summary.calls).padStart(4)} calls  ` +
		`${String(summary.meanPromptTokens).padStart(7)} prompt  ` +
		`${String(summary.meanCompletionTokens).padStart(7)} out  ` +
		`mean ${summary.meanLatencyMs}ms  p95 ${summary.p95LatencyMs}ms${width}`
	);
};

/**
 * What one eval run cost, printed the same way by every eval.
 *
 * This exists because the alternative is thirteen copies of four console.logs,
 * and a baseline assembled from thirteen slightly different formats is a
 * baseline nobody can put in one table. The `@N-way` note is not decoration
 * either: every eval here fires its rows through `Promise.all`, so the
 * latencies carry the provider's queueing at that width and are comparable
 * between runs of the same eval, never with a production call.
 *
 * Drains the module-global cost recorder on the way in, so a run's total is
 * its own rather than whatever the previous eval in the process left behind.
 */
export const reportRunUsage = (
	recorder: ReturnType<typeof usageRecorder>,
	startedAt: number,
	concurrency?: number,
): void => {
	const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(0);

	console.log(`\nCost of this run (${elapsedSeconds}s wall clock):`);
	console.log(formatRunCost(takeRecordedUsage()));
	console.log(
		formatCallStats(summariseCalls(recorder.takeCalls()), concurrency),
	);

	const open = recorder.openCalls();
	if (open > 0)
		console.log(
			`  ${"unfinished".padEnd(14)} ${open} calls started and never ended — their spend is not in the line above`,
		);
};

/** Drains the cost recorder before a run, so the total is this run's alone. */
export const startRunUsage = (): number => {
	takeRecordedUsage();
	return Date.now();
};
