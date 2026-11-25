import { describe, expect, it } from "vitest";
import { runSummaryMessage } from "./utils";

describe("runSummaryMessage", () => {
	it("says there is nothing to release for an empty run", () => {
		expect(runSummaryMessage({ processed: 0, released: 0, failed: 0 })).toBe(
			"Nothing to release right now.",
		);
	});

	it("names released and failed counts", () => {
		expect(runSummaryMessage({ processed: 3, released: 2, failed: 1 })).toBe(
			"Released 2 of 3 payout(s), 1 failed.",
		);
	});
});
