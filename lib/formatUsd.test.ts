import { describe, expect, it } from "vitest";
import { formatUsd, formatUsdCompact } from "./formatUsd";

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

describe("formatUsdCompact", () => {
	it("shows $0 for zero", () => {
		expect(formatUsdCompact(0)).toBe("$0");
	});

	it("keeps full dollars under 1,000", () => {
		expect(formatUsdCompact(95000)).toBe("$950");
		expect(formatUsdCompact(99900)).toBe("$999");
	});

	it("uses k for thousands, dropping a trailing .0", () => {
		expect(formatUsdCompact(120000)).toBe("$1.2k");
		expect(formatUsdCompact(9515000)).toBe("$95.2k");
		expect(formatUsdCompact(500000000)).toBe("$5M"); // 5,000,000 -> M, not 5000k
	});

	it("uses M for millions, dropping a trailing .0", () => {
		expect(formatUsdCompact(100000000)).toBe("$1M");
		expect(formatUsdCompact(110000000)).toBe("$1.1M");
	});

	it("never returns a negative-zero string", () => {
		expect(formatUsdCompact(-0)).toBe("$0");
	});
});
