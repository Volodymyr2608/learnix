import { describe, expect, it } from "vitest";
import { isStale } from "./payoutMonitorRules";

const NOW = new Date("2026-11-20T10:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600 * 1000);

describe("isStale (review M1: one rule for the alert and the panel)", () => {
	it("is stale more than 48 h after the last success", () => {
		expect(isStale(hoursAgo(49), 0, NOW)).toBe(true);
		expect(isStale(hoursAgo(47), 5, NOW)).toBe(false);
	});

	it("without any success, is stale only while money is held", () => {
		expect(isStale(null, 1, NOW)).toBe(true);
		expect(isStale(null, 0, NOW)).toBe(false);
	});
});
