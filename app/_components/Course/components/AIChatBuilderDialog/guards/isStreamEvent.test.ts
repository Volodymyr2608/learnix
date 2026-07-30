import { describe, expect, it } from "vitest";
import { isStreamEvent } from "./isStreamEvent";

describe("isStreamEvent — error variant", () => {
	it("accepts an error event carrying the retryable flag", () => {
		expect(
			isStreamEvent({ type: "error", message: "boom", retryable: true }),
		).toBe(true);
	});

	it("still accepts an error event without the flag, rather than dropping it", () => {
		// A rejected event is skipped by useChatStreaming, so requiring the flag
		// would turn a stale-server error into complete silence.
		expect(isStreamEvent({ type: "error", message: "boom" })).toBe(true);
	});

	it("rejects an error event whose flag is not a boolean", () => {
		expect(
			isStreamEvent({ type: "error", message: "boom", retryable: "yes" }),
		).toBe(false);
	});

	it("still accepts the events it accepted before", () => {
		expect(isStreamEvent({ type: "done" })).toBe(true);
		expect(isStreamEvent({ type: "token", value: "hi" })).toBe(true);
		expect(isStreamEvent({ type: "guard_blocked", message: "no" })).toBe(true);
	});
});
