import { describe, expect, it } from "vitest";
import { computeSplit } from "./platformFee";

describe("computeSplit", () => {
	it("20% of 10000", () =>
		expect(computeSplit(10000, 20)).toEqual({
			platformFeeCents: 2000,
			instructorNetCents: 8000,
		}));
	it("rounds the fee on odd amounts", () =>
		expect(computeSplit(9999, 20)).toEqual({
			platformFeeCents: 2000,
			instructorNetCents: 7999,
		}));
	it("falls back to the default 20% when feePercent is undefined", () =>
		expect(computeSplit(10000)).toEqual({
			platformFeeCents: 2000,
			instructorNetCents: 8000,
		}));
	it("falls back to the default 20% when feePercent is NaN", () =>
		expect(computeSplit(10000, Number.NaN)).toEqual({
			platformFeeCents: 2000,
			instructorNetCents: 8000,
		}));
	it("coerces a numeric-string feePercent", () =>
		expect(computeSplit(10000, "20" as unknown as number)).toEqual({
			platformFeeCents: 2000,
			instructorNetCents: 8000,
		}));
	it("respects a 0% fee (no platform cut)", () =>
		expect(computeSplit(10000, 0)).toEqual({
			platformFeeCents: 0,
			instructorNetCents: 10000,
		}));
});
