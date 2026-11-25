import { describe, expect, it } from "vitest";
import {
	REFUND_POLICY_HREF,
	refundDeadlineText,
	refundPageHref,
	refundStatusLabel,
} from "./utils";

describe("RefundRowAction utils (FR-S1, FR-S12)", () => {
	it.each([
		["processing", "Refund processing"],
		// The row's own badge already says "Refunded"; the link names what it opens (review M6).
		["refunded", "Refund details"],
		["denied", "Refund denied"],
	] as const)("labels the %s status link", (status, label) => {
		expect(refundStatusLabel(status)).toBe(label);
	});

	it("states the deadline as a UTC date, even where the local date differs", () => {
		// 23:30 UTC on 15 Nov is already 16 Nov east of UTC: the deadline is the UTC day.
		expect(refundDeadlineText(new Date("2026-11-15T23:30:00.000Z"))).toBe(
			"Refundable until 15 November 2026 (UTC)",
		);
	});

	it("links the action to the purchase's refund page and the tooltip to the policy", () => {
		expect(refundPageHref("pay_1")).toBe("/dashboard/billing/pay_1/refund");
		expect(REFUND_POLICY_HREF).toBe("/refund-policy");
	});
});
