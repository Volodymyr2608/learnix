import { describe, expect, it } from "vitest";
import { formatPrice } from "./formatPrice";

describe("formatPrice", () => {
	it("renders 0 as Free", () => expect(formatPrice(0)).toBe("Free"));
	it("renders whole dollars", () => expect(formatPrice(4900)).toBe("$49.00"));
	it("renders cents", () => expect(formatPrice(4999)).toBe("$49.99"));
});
