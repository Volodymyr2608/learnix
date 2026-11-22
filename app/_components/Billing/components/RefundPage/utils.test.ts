import { describe, expect, it } from "vitest";
import {
	ALREADY_REFUNDED_TEXT,
	CERTIFICATE_TEXT,
	DISPUTE_TEXT,
	deniedConditions,
	overLimitLines,
	PROCESSING_TEXT,
	REFUND_CONSEQUENCES,
	refundAmountText,
	refundedText,
	submittedText,
	windowClosedText,
} from "./utils";

describe("refund page texts", () => {
	it("states the FR-S20 processing text exactly", () => {
		expect(PROCESSING_TEXT).toBe(
			"Refund processing. Your refund has been approved and is being processed. Your access stays open until it completes. If it takes longer than 3 days, we will email you.",
		);
	});

	it("states the FR-S11 dispute text exactly", () => {
		expect(DISPUTE_TEXT).toBe(
			"A dispute about this payment is open with your bank; the refund is decided there",
		);
	});

	it("says when the window ended (FR-S8), as a UTC date", () => {
		expect(windowClosedText(new Date("2026-11-15T23:30:00.000Z"))).toBe(
			"The refund period ended on 15 November 2026",
		);
		expect(windowClosedText(null)).toBe("The refund period has ended");
	});

	it("names the threshold and the account limit with their numbers (FR-S13)", () => {
		expect(
			overLimitLines([
				{ condition: "threshold", openedCount: 4, threshold: 3 },
				{ condition: "account_limit", refunds: 3, limit: 3 },
			]),
		).toEqual([
			"You opened 4 lessons; the limit for this course is 3.",
			"Your account has 3 refunds in the last 12 months; the limit is 3.",
		]);
		expect(
			overLimitLines([
				{ condition: "threshold", openedCount: 1, threshold: 0 },
			]),
		).toEqual(["You opened 1 lesson; the limit for this course is 0."]);
	});

	it("lists the three consequences (FR-S4)", () => {
		expect(REFUND_CONSEQUENCES).toEqual([
			"Your access to the course closes.",
			"Your progress in the course is erased.",
			"A course can be refunded only once.",
		]);
	});

	it("states the amount and the refunded note (FR-S4, FR-S19)", () => {
		expect(refundAmountText(4900, "usd")).toBe("You will be refunded $49.00.");
		expect(refundedText(4900, "usd")).toBe(
			"Refunded $49.00. The money reaches your card in about 5–10 business days.",
		);
	});

	it("names the failed conditions of a denial and the filing date", () => {
		expect(deniedConditions(["window", "threshold"])).toEqual([
			"The 14-day refund period has ended.",
			"You opened more lessons than the refund limit for this course.",
		]);
		expect(submittedText(new Date("2026-11-03T10:00:00.000Z"))).toBe(
			"Submitted on 3 November 2026",
		);
	});

	it("explains a certificate and an earlier refund", () => {
		expect(CERTIFICATE_TEXT).toContain("certificate");
		expect(ALREADY_REFUNDED_TEXT).toContain("only once");
	});
});
