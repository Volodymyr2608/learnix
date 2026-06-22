import { describe, expect, it } from "vitest";
import { computeDiscountPercent } from "./discount";

describe("computeDiscountPercent", () => {
	it("returns null when there is no original price", () =>
		expect(computeDiscountPercent(5000, null)).toBeNull());
	it("returns null when original ≤ price", () =>
		expect(computeDiscountPercent(5000, 5000)).toBeNull());
	it("computes a rounded percentage off", () =>
		expect(computeDiscountPercent(4500, 9000)).toBe(50));
	it("rounds to the nearest integer", () =>
		expect(computeDiscountPercent(6700, 10000)).toBe(33));
});
