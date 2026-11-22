import { describe, expect, it } from "vitest";
import {
	REFUND_POLICY_HREF,
	refundPageHref,
	refundStatusLabel,
	refundTooltipText,
} from "./utils";

describe("RefundRowAction utils (FR-S1, FR-S12)", () => {
	it.each([
		["processing", "Refund processing"],
		["refunded", "Refunded"],
		["denied", "Denied"],
	] as const)("labels the %s status", (status, label) => {
		expect(refundStatusLabel(status)).toBe(label);
	});

	it("states the deadline as a UTC date, even where the local date differs", () => {
		// 23:30 UTC on 15 Nov is already 16 Nov east of UTC: the deadline is the UTC day.
		expect(refundTooltipText(new Date("2026-11-15T23:30:00.000Z"))).toBe(
			"Refundable until 15 November 2026 (UTC)",
		);
	});

	it("links the action to the purchase's refund page and the tooltip to the policy", () => {
		expect(refundPageHref("pay_1")).toBe("/dashboard/billing/pay_1/refund");
		expect(REFUND_POLICY_HREF).toBe("/pricing#refund-policy");
	});
});
