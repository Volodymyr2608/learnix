import { describe, expect, it } from "vitest";
import { isStreamEvent } from "./isStreamEvent";

describe("isStreamEvent — error variant", () => {
	it("accepts an error event carrying the retryable flag", () => {
		expect(
			isStreamEvent({ type: "error", message: "boom", retryable: true }),
		).toBe(true);
	});

	it("rejects an error event without the retryable flag", () => {
		// The flag is required so a stale server can never render as a
		// permanent failure the client would silently mislabel.
		expect(isStreamEvent({ type: "error", message: "boom" })).toBe(false);
	});

	it("still accepts the events it accepted before", () => {
		expect(isStreamEvent({ type: "done" })).toBe(true);
		expect(isStreamEvent({ type: "token", value: "hi" })).toBe(true);
		expect(isStreamEvent({ type: "guard_blocked", message: "no" })).toBe(true);
	});
});
