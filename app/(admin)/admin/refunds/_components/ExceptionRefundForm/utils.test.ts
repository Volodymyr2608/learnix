import { describe, expect, it } from "vitest";
import { exceptionResultText } from "./utils";

describe("ExceptionRefundForm utils (FR-A6)", () => {
	it("says what happened", () => {
		expect(exceptionResultText("refunded")).toBe("Refunded as an exception.");
		expect(exceptionResultText("already_refunded")).toBe(
			"This payment was already refunded; nothing changed.",
		);
	});
});
