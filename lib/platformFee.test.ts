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
});
