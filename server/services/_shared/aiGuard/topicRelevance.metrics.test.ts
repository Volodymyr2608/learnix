import { beforeEach, describe, expect, it, vi } from "vitest";
import { aiMetricsHandler } from "@/server/services/_shared/aiMetrics/handler";

const { mockLogger, mockInvoke, mockCtor } = vi.hoisted(() => ({
	mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
	mockInvoke: vi.fn(),
	mockCtor: vi.fn(),
}));

vi.mock("@/server/utils/logger", () => ({ logger: mockLogger }));
vi.mock("@langchain/openai", () => ({
	ChatOpenAI: class {
		constructor(config: unknown) {
			mockCtor(config);
		}
		withStructuredOutput() {
			return { invoke: mockInvoke };
		}
	},
}));

const { checkTopicRelevance } = await import("./topicRelevance");
const { guardUserInput } = await import("./guardUserInput");

/**
 * spec.md AC 11 / security.md §S3. This is the one control `pnpm classify`
 * names, so it is proven in BOTH directions per documentation-process.md §3d —
 * a recall-only check would miss the failure this change could actually cause.
 *
 * The false-positive half is the one that matters here. A meter that slowed L2
 * enough to push borderline calls past their 3 s budget would convert ALLOWED
 * turns into fail-open ones: the guard would still "work", every recall test
 * would still pass, and legitimate students would silently lose their L2 screen.
 */

const context = {
	feature: "lessonAI" as const,
	userId: "student-1",
	metrics: aiMetricsHandler({ feature: "lessonAI" }),
	domain: {
		description: "the lesson 'Recursion' in the course 'Algorithms'",
		subject: "Recursion",
	},
};

beforeEach(() => {
	mockLogger.info.mockClear();
	mockLogger.error.mockClear();
	mockLogger.warn.mockClear();
	mockInvoke.mockReset();
	mockCtor.mockClear();
});

describe("the control is unchanged (AC 11)", () => {
	it("still declares timeout 3s and one retry", async () => {
		// The budget is a boundary, not a tuning constant: exceeding it throws onto
		// the fail-open path, which is what turns a SLOW provider into an event
		// rather than a silently waiting student.
		mockInvoke.mockResolvedValue({ onTopic: true, reason: "" });

		await checkTopicRelevance(
			"what is a base case?",
			context.domain,
			aiMetricsHandler({ feature: "lessonAI", node: "l2_topic_relevance" }),
		);

		expect(mockCtor).toHaveBeenCalledWith(
			expect.objectContaining({ timeout: 3_000, maxRetries: 1 }),
		);
	});

	it("RECALL: an off-topic message is still blocked", async () => {
		mockInvoke.mockResolvedValue({ onTopic: false, reason: "unrelated" });

		const verdict = await guardUserInput("who won the world cup?", context);

		expect(verdict.outcome).toBe("off_topic");
	});

	it("FALSE POSITIVE: an on-topic message is still allowed", async () => {
		mockInvoke.mockResolvedValue({ onTopic: true, reason: "on topic" });

		const verdict = await guardUserInput(
			"can you explain the base case again?",
			context,
		);

		expect(verdict.outcome).toBe("allow");
	});

	it("FAIL-OPEN: a timeout still allows the turn and reports l2_unavailable", async () => {
		mockInvoke.mockRejectedValue(
			Object.assign(new Error("timed out"), { name: "TimeoutError" }),
		);

		const verdict = await guardUserInput("what is a base case?", context);

		expect(verdict.outcome).toBe("allow");
		const fallback = mockLogger.warn.mock.calls.find(
			([fields]) =>
				(fields as { outcome?: string }).outcome === "fallback_triggered",
		);
		expect(fallback?.[0]).toMatchObject({
			layer: "L2",
			ruleIds: ["l2_unavailable"],
		});
	});
});

describe("the L2 call is now measured (AC 3)", () => {
	const callLines = () =>
		mockLogger.info.mock.calls
			.map(([fields]) => fields as Record<string, unknown>)
			.filter((f) => "latencyMs" in f);

	it("attaches a handler that reports the guard as its node", async () => {
		// ChatOpenAI is mocked wholesale here, so LangChain's callback machinery
		// never runs — asserting an emitted line through this mock would be testing
		// the mock. Instead the REAL handler the guard attached is pulled out of
		// the config and driven directly, which proves what is actually this
		// module's job: that it configured the handler correctly.
		mockInvoke.mockResolvedValue({ onTopic: true, reason: "" });

		await checkTopicRelevance(
			"what is a base case?",
			context.domain,
			aiMetricsHandler({ feature: "lessonAI", node: "l2_topic_relevance" }),
		);

		const [, config] = mockInvoke.mock.calls[0] ?? [];
		const [handler] = (config as { callbacks: Record<string, never>[] })
			.callbacks;
		const hooks = handler as unknown as {
			handleChatModelStart: (...a: unknown[]) => void;
			handleLLMEnd: (...a: unknown[]) => void;
		};

		hooks.handleChatModelStart({}, [[]], "run-1", undefined, {
			invocation_params: { model: "gpt-4o-mini" },
		});
		hooks.handleLLMEnd(
			{
				generations: [
					[
						{
							text: "",
							message: {
								usage_metadata: { input_tokens: 40, output_tokens: 5 },
							},
						},
					],
				],
			},
			"run-1",
		);

		expect(callLines()[0]).toMatchObject({
			feature: "lessonAI",
			node: "l2_topic_relevance",
			model: "gpt-4o-mini",
			promptTokens: 40,
		});
	});

	it("passes the handler through the invoke config", async () => {
		mockInvoke.mockResolvedValue({ onTopic: true, reason: "" });

		await checkTopicRelevance(
			"what is a base case?",
			context.domain,
			aiMetricsHandler({ feature: "lessonAI", node: "l2_topic_relevance" }),
		);

		const [, config] = mockInvoke.mock.calls[0] ?? [];
		expect(Array.isArray((config as { callbacks?: unknown }).callbacks)).toBe(
			true,
		);
	});

	it("metering never changes the verdict it observes", async () => {
		// The guard's answer must be a function of the model's answer alone.
		mockInvoke.mockResolvedValue({ onTopic: false, reason: "unrelated" });
		const blocked = await guardUserInput("off topic", context);

		mockInvoke.mockResolvedValue({ onTopic: true, reason: "fine" });
		const allowed = await guardUserInput("on topic", context);

		expect([blocked.outcome, allowed.outcome]).toEqual(["off_topic", "allow"]);
	});
});
