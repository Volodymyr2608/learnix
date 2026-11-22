import { describe, expect, it } from "vitest";
import { outcomeBadge, staleMessage } from "./utils";

describe("PayoutStatusCard utils", () => {
	it.each([
		["succeeded", "Succeeded", "secondary"],
		["failed", "Failed", "destructive"],
		["crashed", "Crashed", "destructive"],
		["running", "Running", "outline"],
	] as const)("labels %s", (outcome, label, variant) => {
		expect(outcomeBadge(outcome)).toEqual({ label, variant });
	});

	it("names the last success in the stale warning, or says there was none", () => {
		expect(staleMessage(new Date("2026-11-18T03:00:00.000Z"))).toBe(
			"No successful payout run for over 48 hours. Last success: 2026-11-18 03:00 UTC.",
		);
		expect(staleMessage(null)).toBe(
			"No payout run has ever succeeded while instructor money is held.",
		);
	});
});
