import { describe, expect, it } from "vitest";
import { refundRequestInput } from "./refund.dto";

const valid = { paymentId: "pay_1", reason: "too_easy" };

describe("refundRequestInput", () => {
	it("accepts a closed-list reason with optional text (FR-S3)", () => {
		expect(refundRequestInput.parse({ ...valid, text: " ok " })).toEqual({
			...valid,
			text: "ok",
		});
	});

	it.each([
		["amount", 1],
		["studentId", "someone"],
		["files", []],
	])("rejects the extra key %s (AC-C2, C1, FR-S3)", (key, value) => {
		expect(() =>
			refundRequestInput.parse({ ...valid, [key]: value }),
		).toThrow();
	});

	it("rejects a reason outside the closed list", () => {
		expect(() =>
			refundRequestInput.parse({ ...valid, reason: "changed_my_mind" }),
		).toThrow();
	});

	it("caps text at 2000 characters (AC-C22, P5)", () => {
		expect(() =>
			refundRequestInput.parse({ ...valid, text: "x".repeat(2000) }),
		).not.toThrow();
		expect(() =>
			refundRequestInput.parse({ ...valid, text: "x".repeat(2001) }),
		).toThrow();
	});
});
