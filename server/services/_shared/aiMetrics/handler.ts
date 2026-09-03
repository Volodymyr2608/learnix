import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
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
const modelOf = (extraParams?: Record<string, unknown>): string => {
	const params = extraParams?.invocation_params as
		| { model?: unknown; model_name?: unknown }
		| undefined;
	const model = params?.model ?? params?.model_name;
	return typeof model === "string" ? model : UNKNOWN_MODEL;
};

/** The failing error's class as a scalar — never its message (AC 7). */
const errorNameOf = (err: unknown): string => {
	if (typeof err !== "object" || err === null) return "unknown";
	const name = (err as { name?: unknown }).name;
	if (typeof name === "string") return name;
	return (
		(err as { constructor?: { name?: string } }).constructor?.name ?? "unknown"
	);
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

		// A user who navigated away is not a failure. Filing them as one poisons
		// the signal this exists to produce, so an abort emits no call line at
		// all — the turn summary still records that the turn ended (AC 8).
		if (isNodeAbort(err)) return;

		// A failed call is still a call: excluding it would make the failure rate
		// unreadable, since its own denominator would shrink with it.
		this.calls += 1;

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

		emitTurn({
			feature: this.ctx.feature,
			calls: this.calls,
			promptTokens: this.promptTokens,
			completionTokens: this.completionTokens,
			costUsd: this.anyUnpriced ? null : this.costUsd,
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
