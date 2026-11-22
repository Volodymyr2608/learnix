import { describe, expect, it } from "vitest";
import { REPURCHASE_NOT_REFUNDABLE_TEXT } from "./utils";

describe("PurchaseConfirmDialog utils (FR-S23)", () => {
	it("states the repurchase warning exactly", () => {
		expect(REPURCHASE_NOT_REFUNDABLE_TEXT).toBe(
			"You have already refunded this course, so this purchase cannot be refunded",
		);
	});
});
