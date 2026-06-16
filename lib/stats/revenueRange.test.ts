import { describe, expect, it } from "vitest";
import { resolveRange } from "./revenueRange";

describe("resolveRange", () => {
	it("30d → daily bucket, since = 30 days before now", () => {
		const now = new Date(2026, 5, 16, 12, 0, 0); // 2026-06-16
		expect(resolveRange("30d", now)).toEqual({
			since: new Date(2026, 4, 17, 12, 0, 0), // 30 days earlier
			bucket: "day",
		});
	});

	it("6m → monthly bucket, since = start of the month 5 months ago", () => {
		const now = new Date(2026, 5, 16); // June 2026
		expect(resolveRange("6m", now)).toEqual({
			since: new Date(2026, 0, 1), // Jan 2026 (6-month inclusive window)
			bucket: "month",
		});
	});

	it("12m → monthly bucket, since = start of the month 11 months ago", () => {
		const now = new Date(2026, 5, 16); // June 2026
		expect(resolveRange("12m", now)).toEqual({
			since: new Date(2025, 6, 1), // Jul 2025
			bucket: "month",
		});
	});

	it("handles year rollover for 12m", () => {
		const now = new Date(2026, 1, 10); // Feb 2026
		expect(resolveRange("12m", now)).toEqual({
			since: new Date(2025, 2, 1), // Mar 2025
			bucket: "month",
		});
	});
});