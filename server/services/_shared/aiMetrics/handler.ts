import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import { consumeCallback } from "@langchain/core/callbacks/promises";
import type { Serialized } from "@langchain/core/load/serializable";
import type { LLMResult } from "@langchain/core/outputs";
import {
	isNodeAbort,
	isRetryable,
} from "@/server/services/_shared/aiErrors/errorShape";
import { emitCall, emitTurn } from "@/server/services/_shared/aiMetrics/emit";
import {
	usageCost,
	usageOfMessage,
} from "@/server/services/_shared/aiMetrics/pricing";
import type {
	AiMetricContext,
	AiMetricOutcome,
} from "@/server/services/_shared/aiMetrics/types";

/** What a call needs remembered between its start and its end. */
type OpenCall = {
	startedAt: number;
	node: string;
	model: string;
};

const UNKNOWN_MODEL = "unknown";

/**
 * The model id, dug out of the invocation params the callback carries.
 *
 * Read defensively: this is provider-shaped data, and a shape change must
 * degrade the model label rather than throw inside a student's turn.
 */
export const modelOf = (extraParams?: Record<string, unknown>): string => {
	const params = extraParams?.invocation_params as
		| { model?: unknown; model_name?: unknown }
		| undefined;
	const model = params?.model ?? params?.model_name;
	return typeof model === "string" ? model : UNKNOWN_MODEL;
};

/**
 * A class name, structurally rather than by convention.
 *
 * `errorNameOf` previously emitted whatever string sat on `.name`, at any
 * length, from any thrown object — so "a class name, never a message" held only
 * because no live path put text there. Constraining the shape makes the claim
 * true by construction instead of by circumstance (security.md §S2).
 */
const CLASS_NAME = /^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/;

const errorNameOf = (err: unknown): string => {
	if (typeof err !== "object" || err === null) return "unknown";
	const name = (err as { name?: unknown }).name;
	const candidate =
		typeof name === "string"
			? name
			: (err as { constructor?: { name?: string } }).constructor?.name;

	return candidate && CLASS_NAME.test(candidate) ? candidate : "unknown";
};

/**
 * Meters every model call underneath one run.
 *
 * Attached ONCE, in the `RunnableConfig` at a run root. LangGraph propagates the
 * config into every node, and each node forwards it to `model.invoke` — so this
 * reaches calls it never named, including nodes added later. That is the whole
 * reason it is a handler rather than a wrapper at each call site: there is no
 * per-call-site step for anyone to forget.
 *
 * **`handleChatModelStart` is implemented and `handleLLMStart` deliberately is
 * not.** The callback manager falls back to `handleLLMStart` only when the chat
 * hook is absent, and that fallback runs `getBufferString` over every message —
 * materialising the fully rendered prompt, untrusted course and student text
 * included, one property access from this code. Not implementing it means the
 * string is never built. See security.md §S2.
 */
class AiMetricsHandler extends BaseCallbackHandler {
	name = "aiMetrics";

	/**
	 * Open calls, keyed by runId. Per-turn instances are never shared between
	 * turns, so concurrent turns in one process cannot collide here.
	 */
	private readonly open = new Map<string, OpenCall>();

	private readonly turnStartedAt = Date.now();
	private calls = 0;
	private promptTokens = 0;
	private completionTokens = 0;
	private costUsd = 0;
	/** Once true the turn total is unknowable, not merely incomplete. */
	private anyUnpriced = false;
	private firstTokenAt: number | undefined;
	private summarised = false;

	constructor(private readonly ctx: AiMetricContext) {
		super();
	}

	handleChatModelStart(
		_llm: Serialized,
		_messages: unknown[][],
		runId: string,
		_parentRunId?: string,
		extraParams?: Record<string, unknown>,
		_tags?: string[],
		metadata?: Record<string, unknown>,
	): void {
		// `_messages` is the rendered conversation. It is named to be ignored and
		// is never read: nothing in this class touches call content.
		const node = metadata?.langgraph_node;

		this.open.set(runId, {
			startedAt: Date.now(),
			node: typeof node === "string" ? node : (this.ctx.node ?? "root"),
			model: modelOf(extraParams),
		});
	}

	handleLLMEnd(output: LLMResult, runId: string): void {
		const call = this.take(runId);
		if (!call) return;

		const message = output.generations?.[0]?.[0] as
			| { message?: unknown }
			| undefined;
		const usage = usageOfMessage(message?.message);
		const cost = usageCost(usage, call.model);

		this.calls += 1;
		this.promptTokens += usage.inputTokens;
		this.completionTokens += usage.outputTokens;
		if (cost === null) this.anyUnpriced = true;
		else this.costUsd += cost;

		emitCall({
			feature: this.ctx.feature,
			node: call.node,
			model: call.model,
			latencyMs: Date.now() - call.startedAt,
			promptTokens: usage.inputTokens,
			completionTokens: usage.outputTokens,
			costUsd: cost,
			outcome: "ok",
		});
	}

	handleLLMError(err: unknown, runId: string): void {
		const call = this.take(runId);
		if (!call) return;

		// A failed call is still a call: excluding it would make the failure rate
		// unreadable, since its own denominator would shrink with it.
		this.calls += 1;

		// A user who navigated away is not a failure. Filing them as one poisons
		// the signal this exists to produce, so an abort emits no call line at
		// all — the turn summary still records that the turn ended (AC 8).
		//
		// But tokens WERE spent and no end event carried their count, so the
		// turn's total is unknowable rather than zero. The costliest failure in
		// the system is a turn that hits TURN_DEADLINE_MS after chaining node
		// calls; reporting it as $0.00 makes the priciest runaway turns read as
		// free, which is the defect "a silent $0.00 is a defect, not a default"
		// exists to forbid.
		if (isNodeAbort(err)) {
			this.anyUnpriced = true;
			return;
		}

		emitCall({
			feature: this.ctx.feature,
			node: call.node,
			model: call.model,
			latencyMs: Date.now() - call.startedAt,
			promptTokens: 0,
			completionTokens: 0,
			costUsd: null,
			outcome: isRetryable(err) ? "retryable_error" : "fatal_error",
			errorName: errorNameOf(err),
		});
	}

	/**
	 * First token only — TTFT is what an SSE reader waits on, not the last token.
	 *
	 * The parameters are declared even though none is read: narrowing the base
	 * signature to zero makes every ordinary three-argument call fail to compile
	 * at the call site.
	 */
	handleLLMNewToken(_token: string, _idx?: unknown, _runId?: string): void {
		this.firstTokenAt ??= Date.now();
	}

	/**
	 * One line per turn, emitted by the caller at whichever exit it reaches.
	 *
	 * Idempotent, because several exits legitimately reach it: lessonAI can pass
	 * through its in-loop abort check, its catch AND its finally on one turn, and
	 * a turn counted twice is a real defect in every rate built from these lines.
	 * The first outcome wins — it is the one that actually described the turn.
	 */
	emitSummary(outcome: AiMetricOutcome): void {
		if (this.summarised) return;
		this.summarised = true;

		// Queued, not written inline — and this is the whole correctness of the
		// summary. `BaseCallbackHandler` defaults `awaitHandlers` to false
		// (callbacks/base.js:66), so the manager hands every hook to
		// `consumeCallback`, which pushes it onto a process-global queue of
		// concurrency 1 WITHOUT awaiting (singletons/callbacks.js:33).
		// `handleLLMEnd` therefore does not run inside the model call; it runs
		// when that queue reaches it.
		//
		// A summary written synchronously from a service's `finally` can
		// therefore overtake the very calls it is meant to total. When the queue
		// is idle the job starts synchronously and the numbers happen to be
		// right, which is why unit tests and a real single-call smoke test both
		// passed. With a second concurrent turn holding the slot, the turn
		// reports `calls: 0, costUsd: 0` — spend under-reported, precisely under
		// the load this metric exists to observe.
		//
		// Enqueuing here puts the summary behind its own call callbacks in the
		// same FIFO. The alternative, `super({_awaitHandler: true})`, also fixes
		// the ordering but moves the write inline into every model call including
		// L2's 3s budget — which would invalidate the false-positive measurement
		// security.md §S3 relies on. See ordering.test.ts.
		void consumeCallback(async () => this.writeSummary(outcome), false);
	}

	private writeSummary(outcome: AiMetricOutcome): void {
		// A call that started and never ended — the consumer abandoned the stream
		// mid-token — is counted, and makes the total unknowable for the same
		// reason an abort does: its tokens were spent and never reported.
		const orphaned = this.open.size;

		emitTurn({
			feature: this.ctx.feature,
			calls: this.calls + orphaned,
			promptTokens: this.promptTokens,
			completionTokens: this.completionTokens,
			costUsd: this.anyUnpriced || orphaned > 0 ? null : this.costUsd,
			wallMs: Date.now() - this.turnStartedAt,
			...(this.firstTokenAt === undefined
				? {}
				: { ttftMs: this.firstTokenAt - this.turnStartedAt }),
			outcome,
		});
	}

	private take(runId: string): OpenCall | undefined {
		const call = this.open.get(runId);
		this.open.delete(runId);
		return call;
	}
}

export const aiMetricsHandler = (ctx: AiMetricContext): AiMetricsHandler =>
	new AiMetricsHandler(ctx);

/** The handler as callers hold it — threaded from a route into the guard and the service. */
export type { AiMetricsHandler };

/**
 * How a TURN ended, from whatever escaped it.
 *
 * Written as early returns rather than chained ternaries — the constitution
 * forbids the latter, and three outcomes on one predicate chain is exactly the
 * shape that rule exists for.
 */
export const turnOutcomeOf = (err: unknown): AiMetricOutcome => {
	if (isNodeAbort(err)) return "aborted";
	if (isRetryable(err)) return "retryable_error";
	return "fatal_error";
};
