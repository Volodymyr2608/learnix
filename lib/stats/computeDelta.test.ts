import { describe, expect, it } from "vitest";
import { computeDelta } from "./computeDelta";

describe("computeDelta", () => {
	it("computes a positive percentage when previous > 0", () => {
		expect(computeDelta(110, 100)).toEqual({
			kind: "percent",
			value: 10,
			direction: "up",
		});
	});

	it("computes a negative percentage and rounds to a whole number", () => {
		expect(computeDelta(80, 120)).toEqual({
			kind: "percent",
			value: -33,
			direction: "down",
		});
	});

	it("reports flat when current equals previous", () => {
		expect(computeDelta(100, 100)).toEqual({
			kind: "percent",
			value: 0,
			direction: "flat",
		});
	});

	it("reports 'new' when previous is 0 and current > 0", () => {
		expect(computeDelta(50, 0)).toEqual({ kind: "new" });
	});

	it("reports 'none' when both are 0", () => {
		expect(computeDelta(0, 0)).toEqual({ kind: "none" });
	});
});
