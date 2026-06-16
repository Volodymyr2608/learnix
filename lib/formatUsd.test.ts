import { describe, expect, it } from "vitest";
import { formatUsd } from "./formatUsd";

describe("formatUsd", () => {
	it("formats zero as $0 (not 'Free')", () => {
		expect(formatUsd(0)).toBe("$0");
	});

	it("rounds cents to whole dollars with thousands separators", () => {
		expect(formatUsd(9515000)).toBe("$95,150");
	});

	it("rounds to the nearest dollar", () => {
		expect(formatUsd(8999)).toBe("$90");
	});

	it("never returns a negative-zero string", () => {
		expect(formatUsd(-0)).toBe("$0");
	});
});