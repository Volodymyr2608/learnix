import { CallbackManager } from "@langchain/core/callbacks/manager";
import { consumeCallback } from "@langchain/core/callbacks/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLogger } = vi.hoisted(() => ({
	mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/server/utils/logger", () => ({ logger: mockLogger }));

const { aiMetricsHandler } = await import("./handler");

/**
 * The turn summary must include every call that happened in the turn — under
 * concurrency, not just when the process is idle.
 *
 * `BaseCallbackHandler` defaults `awaitHandlers` to false
 * (`@langchain/core/dist/callbacks/base.js:66`), so the manager hands every hook
 * to `consumeCallback`, which pushes it onto a PROCESS-GLOBAL p-queue with
 * concurrency 1 and does not await it (`singletons/callbacks.js:33`).
 * `handleLLMEnd` therefore does not run inside the model call — it runs when
 * that queue reaches it.
 *
 * Every other test in this module drives the handler's methods directly, so the
 * queue is bypassed entirely and this ordering never shows up. When the queue is
 * idle the job happens to start synchronously and the totals are right, which is
 * why a real smoke test also passed. With one other turn's callback occupying
 * the single slot, the summary would be written before the call it should have
 * counted — reporting `calls: 0, costUsd: 0` for a turn that spent money.
 *
 * Found by the /qa security audit; the bias is one-directional (cost is only
 * ever UNDER-reported) and only under load, which is exactly the condition the
 * metric exists to observe.
 */

const endPayload = {
	generations: [
		[
			{
				text: "",
				message: { usage_metadata: { input_tokens: 1000, output_tokens: 100 } },
			},
		],
	],
};

const turnLine = () =>
	mockLogger.info.mock.calls
		.map(([fields]) => fields as Record<string, unknown>)
		.find((f) => "calls" in f);

beforeEach(() => {
	mockLogger.info.mockClear();
});

describe("the turn summary drains behind its own call callbacks", () => {
	it("counts a call whose callback was queued behind another turn's", async () => {
		const handler = aiMetricsHandler({ feature: "lessonAI" });
		const manager = CallbackManager.configure([handler]);
		if (!manager) throw new Error("callback manager not configured");

		// Occupy the single global queue slot, the way a second concurrent turn
		// would. Nothing enqueued after this can run until it resolves.
		let release: () => void = () => {};
		const blocked = new Promise<void>((resolve) => {
			release = resolve;
		});
		void consumeCallback(async () => blocked, false);

		const [run] = await manager.handleChatModelStart(
			{ id: ["ChatOpenAI"] } as never,
			[[]],
			undefined,
			undefined,
			{ invocation_params: { model: "gpt-4o-mini" } },
		);
		await run?.handleLLMEnd(endPayload as never);

		// The service's `finally` fires here — synchronously, while the queue is
		// still blocked.
		handler.emitSummary("ok");

		release();
		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(turnLine()).toMatchObject({
			calls: 1,
			promptTokens: 1000,
			completionTokens: 100,
		});
	});
});
