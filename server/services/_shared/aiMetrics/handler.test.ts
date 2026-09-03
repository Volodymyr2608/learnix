import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLogger } = vi.hoisted(() => ({
	mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/server/utils/logger", () => ({ logger: mockLogger }));

const { aiMetricsHandler } = await import("./handler");

/**
 * spec.md AC 4 / AC 7 / AC 12 / AC 14. The handler is driven directly here
 * rather than through a real graph: the callback contract is what this module
 * depends on, and driving it explicitly is what lets the abort and error paths
 * be exercised at all.
 */

const RUN = "run-1";

const started = (
	handler: ReturnType<typeof aiMetricsHandler>,
	{ node = "confidence_score", runId = RUN, model = "gpt-4o-mini" } = {},
) =>
	handler.handleChatModelStart?.(
		{ id: ["langchain", "chat_models", "openai", "ChatOpenAI"] } as never,
		[[]],
		runId,
		undefined,
		{ invocation_params: { model } },
		undefined,
		{ langgraph_node: node },
	);

const ended = (
	handler: ReturnType<typeof aiMetricsHandler>,
	{ runId = RUN, inputTokens = 1200, outputTokens = 300 } = {},
) =>
	handler.handleLLMEnd?.(
		{
			generations: [
				[
					{
						text: "",
						message: {
							usage_metadata: {
								input_tokens: inputTokens,
								output_tokens: outputTokens,
							},
						},
					},
				],
			],
		} as never,
		runId,
	);

const lines = () =>
	mockLogger.info.mock.calls.map(
		([fields]) => fields as Record<string, unknown>,
	);

beforeEach(() => {
	mockLogger.info.mockClear();
	mockLogger.error.mockClear();
});

describe("the chat hook is the one implemented (AC 6, security.md S2)", () => {
	it("implements handleChatModelStart and NOT handleLLMStart", () => {
		// The callback manager falls back to handleLLMStart only when the chat
		// hook is absent — and that fallback runs getBufferString over every
		// message, materialising the entire rendered prompt. Not implementing it
		// means the untrusted string is never built at all, which is a stronger
		// control than declining to read it.
		const handler = aiMetricsHandler({ feature: "courseAI" });

		expect(handler.handleChatModelStart).toBeTypeOf("function");
		expect(handler.handleLLMStart).toBeUndefined();
	});
});

describe("one measured call (AC 4, AC 12, AC 14)", () => {
	it("emits a line carrying tokens read from the end message", async () => {
		const handler = aiMetricsHandler({ feature: "courseAI" });

		await started(handler);
		await ended(handler);

		expect(lines()).toHaveLength(1);
		expect(lines()[0]).toMatchObject({
			feature: "courseAI",
			node: "confidence_score",
			model: "gpt-4o-mini",
			promptTokens: 1200,
			completionTokens: 300,
			outcome: "ok",
		});
	});

	it("reports a non-zero prompt token count for a streamed call (AC 12)", async () => {
		// Usage arrives on the aggregated end message, not on a chunk; a zero here
		// would mean it was read from the wrong place.
		const handler = aiMetricsHandler({ feature: "lessonAI" });

		await started(handler, { node: "model_request" });
		await ended(handler, { inputTokens: 900, outputTokens: 120 });

		expect(lines()[0]?.promptTokens).toBe(900);
	});

	it("prices the call, and reports null for an unpriced model (AC 2)", async () => {
		const priced = aiMetricsHandler({ feature: "courseAI" });
		await started(priced);
		await ended(priced);
		expect(typeof lines()[0]?.costUsd).toBe("number");

		mockLogger.info.mockClear();
		const unpriced = aiMetricsHandler({ feature: "courseAI" });
		await started(unpriced, { model: "gpt-6-unreleased" });
		await ended(unpriced);
		expect(lines()[0]?.costUsd).toBeNull();
	});

	it("names each node separately, so a slow node is identifiable (AC 14)", async () => {
		const handler = aiMetricsHandler({ feature: "courseAI" });

		await started(handler, { node: "classify_intent", runId: "a" });
		await ended(handler, { runId: "a" });
		await started(handler, { node: "chat_response", runId: "b" });
		await ended(handler, { runId: "b" });

		expect(lines().map((l) => l.node)).toEqual([
			"classify_intent",
			"chat_response",
		]);
	});

	it("falls back to the context node when there is no graph node", async () => {
		const handler = aiMetricsHandler({
			feature: "lessonAI",
			node: "l2_topic_relevance",
		});

		await handler.handleChatModelStart?.(
			{ id: ["ChatOpenAI"] } as never,
			[[]],
			RUN,
			undefined,
			{ invocation_params: { model: "gpt-4o-mini" } },
		);
		await ended(handler);

		expect(lines()[0]?.node).toBe("l2_topic_relevance");
	});
});

describe("errors carry a class, never a message (AC 7)", () => {
	const MARKER = "SECRET_MODEL_OUTPUT_MARKER";

	it("emits errorName and never the error's own text", async () => {
		const handler = aiMetricsHandler({ feature: "courseAI" });
		await started(handler);

		await handler.handleLLMError?.(
			Object.assign(new Error(MARKER), { name: "OutputParserException" }),
			RUN,
		);

		const [line] = lines();
		expect(line).toMatchObject({
			outcome: "fatal_error",
			errorName: "OutputParserException",
		});
		expect(JSON.stringify(line)).not.toContain(MARKER);
	});

	it("classifies a provider fault as retryable", async () => {
		const handler = aiMetricsHandler({ feature: "courseAI" });
		await started(handler);

		await handler.handleLLMError?.(
			Object.assign(new Error("upstream"), { name: "TimeoutError" }),
			RUN,
		);

		expect(lines()[0]?.outcome).toBe("retryable_error");
	});

	it("fails closed: an unrecognised shape is fatal, not retryable", async () => {
		const handler = aiMetricsHandler({ feature: "courseAI" });
		await started(handler);

		await handler.handleLLMError?.(new TypeError("x is not a function"), RUN);

		expect(lines()[0]?.outcome).toBe("fatal_error");
	});

	it("emits no line at all for a client abort (AC 8)", async () => {
		const handler = aiMetricsHandler({ feature: "lessonAI" });
		await started(handler);

		await handler.handleLLMError?.(
			Object.assign(new Error("aborted"), { name: "ModelAbortError" }),
			RUN,
		);

		expect(mockLogger.info).not.toHaveBeenCalled();
	});
});

describe("the turn summary (AC 5, AC 8, AC 13)", () => {
	const turnLine = () =>
		mockLogger.info.mock.calls
			.map(([fields]) => fields as Record<string, unknown>)
			.filter((f) => "calls" in f);

	it("sums tokens and cost across every call in the turn", async () => {
		const handler = aiMetricsHandler({ feature: "courseAI" });

		await started(handler, { runId: "a" });
		await ended(handler, { runId: "a", inputTokens: 100, outputTokens: 10 });
		await started(handler, { runId: "b" });
		await ended(handler, { runId: "b", inputTokens: 200, outputTokens: 20 });

		handler.emitSummary("ok");

		expect(turnLine()[0]).toMatchObject({
			feature: "courseAI",
			calls: 2,
			promptTokens: 300,
			completionTokens: 30,
			outcome: "ok",
		});
		expect(turnLine()[0]?.costUsd).toBeTypeOf("number");
	});

	it("reports the whole turn as unpriced when any one call was (AC 2)", async () => {
		// A partial total is a wrong total: summing only the priced half produces
		// a number that looks authoritative and understates the turn.
		const handler = aiMetricsHandler({ feature: "courseAI" });

		await started(handler, { runId: "a" });
		await ended(handler, { runId: "a" });
		await started(handler, { runId: "b", model: "gpt-6-unreleased" });
		await ended(handler, { runId: "b" });

		handler.emitSummary("ok");

		expect(turnLine()[0]?.costUsd).toBeNull();
	});

	it("emits a summary for a turn that made no model call at all", async () => {
		// A turn the guard blocked at L1 still happened. Suppressing it would drop
		// blocked turns out of the denominator of every rate computed from these.
		const handler = aiMetricsHandler({ feature: "lessonAI" });

		handler.emitSummary("ok");

		expect(turnLine()[0]).toMatchObject({ calls: 0, promptTokens: 0 });
	});

	it("omits ttftMs entirely when nothing streamed (AC 13)", async () => {
		const handler = aiMetricsHandler({ feature: "quizAI" });

		await started(handler);
		await ended(handler);
		handler.emitSummary("ok");

		expect(turnLine()[0]).not.toHaveProperty("ttftMs");
	});

	it("records ttftMs from the first streamed token, not the last (AC 13)", async () => {
		const handler = aiMetricsHandler({ feature: "lessonAI" });

		await started(handler, { node: "model_request" });
		handler.handleLLMNewToken?.("first", undefined as never, RUN);
		handler.handleLLMNewToken?.("second", undefined as never, RUN);
		await ended(handler);
		handler.emitSummary("ok");

		const ttft = turnLine()[0]?.ttftMs;
		expect(ttft).toBeTypeOf("number");
		expect(ttft as number).toBeLessThanOrEqual(turnLine()[0]?.wallMs as number);
	});

	it("emits a summary with outcome aborted and no error line (AC 8)", async () => {
		const handler = aiMetricsHandler({ feature: "lessonAI" });

		await started(handler);
		await handler.handleLLMError?.(
			Object.assign(new Error("gone"), { name: "ModelAbortError" }),
			RUN,
		);
		handler.emitSummary("aborted");

		const all = mockLogger.info.mock.calls.map(
			([fields]) => fields as Record<string, unknown>,
		);
		expect(all).toHaveLength(1);
		expect(all[0]).toMatchObject({ outcome: "aborted", calls: 0 });
	});

	it("is idempotent, because several exits may all reach it", async () => {
		// lessonAI reaches its summary from the in-loop abort check, the catch and
		// the finally. Double-counting a turn is a real defect, so the second call
		// is a no-op — the same reason finishWithoutDelivery guards itself.
		const handler = aiMetricsHandler({ feature: "lessonAI" });

		handler.emitSummary("ok");
		handler.emitSummary("aborted");

		expect(turnLine()).toHaveLength(1);
		expect(turnLine()[0]?.outcome).toBe("ok");
	});
});
