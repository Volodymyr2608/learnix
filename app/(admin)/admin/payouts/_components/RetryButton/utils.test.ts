import { describe, expect, it } from "vitest";
import { retryResultMessage } from "./utils";

describe("retryResultMessage (review I2)", () => {
	it.each([
		[{ status: "refunded" }, "success"],
		[{ outcome: "released" }, "success"],
		[{ outcome: "already_transferred" }, "success"],
		[{ outcome: "reversed_after_refund" }, "success"],
		[{ outcome: "reversed" }, "success"],
	] as const)("treats %o as fixed", (result, tone) => {
		expect(retryResultMessage(result).tone).toBe(tone);
	});

	it.each([
		[{ status: "processing" }, "Still processing at Stripe — see the error."],
		[{ outcome: "failed" }, "The transfer failed again — see the run history."],
		[
			{ outcome: "waiting_for_stripe" },
			"The instructor cannot be paid yet (Stripe payouts off).",
		],
		[
			{ outcome: "charge_not_payable" },
			"The charge is refunded or disputed in Stripe.",
		],
		[
			{ outcome: "not_eligible" },
			"Nothing to do: the payment is not eligible now.",
		],
	] as const)("warns for %o", (result, text) => {
		expect(retryResultMessage(result)).toEqual({ tone: "warning", text });
	});
});
