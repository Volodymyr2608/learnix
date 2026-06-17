import { describe, expect, it } from "vitest";
import { getWeekWindows } from "./getWeekWindows";

describe("getWeekWindows", () => {
	it("returns a 7-day window ending today and the prior 7-day window", () => {
		const now = new Date(2026, 5, 17, 14, 30); // Wed Jun 17 2026, 14:30 local
		const { startThisWeek, startPriorWeek } = getWeekWindows(now);
		expect(startThisWeek).toEqual(new Date(2026, 5, 11, 0, 0, 0, 0)); // Jun 11 00:00
		expect(startPriorWeek).toEqual(new Date(2026, 5, 4, 0, 0, 0, 0)); // Jun 4 00:00
	});
});