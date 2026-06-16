// lib/stats/monthWindows.test.ts
import { describe, expect, it } from "vitest";
import { getMonthWindows } from "./monthWindows";

describe("getMonthWindows", () => {
	it("returns this-month start, last-month start, and next-month start", () => {
		const now = new Date(2026, 5, 16); // 2026-06-16 (month index 5 = June)
		expect(getMonthWindows(now)).toEqual({
			startThisMonth: new Date(2026, 5, 1),
			startLastMonth: new Date(2026, 4, 1),
			startNextMonth: new Date(2026, 6, 1),
		});
	});

	it("handles January (last month is previous December)", () => {
		const now = new Date(2026, 0, 10); // 2026-01-10
		expect(getMonthWindows(now)).toEqual({
			startThisMonth: new Date(2026, 0, 1),
			startLastMonth: new Date(2025, 11, 1),
			startNextMonth: new Date(2026, 1, 1),
		});
	});

	it("handles December (next month rolls into next January)", () => {
		const now = new Date(2026, 11, 31); // 2026-12-31
		expect(getMonthWindows(now)).toEqual({
			startThisMonth: new Date(2026, 11, 1),
			startLastMonth: new Date(2026, 10, 1),
			startNextMonth: new Date(2027, 0, 1),
		});
	});
});