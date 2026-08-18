import { describe, expect, it } from "vitest";
import { isStreamEvent, type StreamEvent } from "./isStreamEvent";

describe("isStreamEvent", () => {
	it("accepts a retract frame", () => {
		expect(isStreamEvent({ type: "retract", message: "…" })).toBe(true);
	});

	it("rejects a retract frame with no message", () => {
		expect(isStreamEvent({ type: "retract" })).toBe(false);
	});

	it("rejects an unknown event type", () => {
		expect(isStreamEvent({ type: "not_a_real_event" })).toBe(false);
	});

	it("rejects a non-object", () => {
		for (const value of [null, undefined, "retract", 7, []]) {
			expect(isStreamEvent(value)).toBe(false);
		}
	});

	it("accepts every event type the server can send", () => {
		const events: StreamEvent[] = [
			{ type: "token", value: "hi" },
			{ type: "start", courseGenerationId: "gen-1" },
			{ type: "tool_call", name: "search", args: {} },
			{ type: "node_start", node: "validate" },
			{ type: "confidence", value: 0.9 },
			{
				type: "step_committed",
				step: "basic",
				autoAdvanced: false,
				confidence: 0.9,
			},
			{ type: "content_revised" },
			{ type: "error", message: "…" },
			{ type: "guard_blocked", message: "…" },
			{ type: "retract", message: "…" },
			{ type: "done" },
		];

		for (const event of events) {
			expect(isStreamEvent(event), event.type).toBe(true);
		}
	});
});
