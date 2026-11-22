import { describe, expect, it } from "vitest";
import { isDueSoon, runOutcome } from "./payoutMonitorRules";

const NOW = new Date("2026-11-20T10:00:00.000Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60 * 1000);

describe("runOutcome (M1, M2)", () => {
	it("is failed when the run recorded an error", () => {
		expect(
			runOutcome(
				{ startedAt: minutesAgo(5), finishedAt: NOW, error: "x" },
				NOW,
			),
		).toBe("failed");
	});

	it("is succeeded when it finished without an error", () => {
		expect(
			runOutcome(
				{ startedAt: minutesAgo(5), finishedAt: NOW, error: null },
				NOW,
			),
		).toBe("succeeded");
	});

	it("is running while unfinished within the lock TTL, crashed after it", () => {
		expect(
			runOutcome(
				{ startedAt: minutesAgo(14), finishedAt: null, error: null },
				NOW,
			),
		).toBe("running");
		expect(
			runOutcome(
				{ startedAt: minutesAgo(16), finishedAt: null, error: null },
				NOW,
			),
		).toBe("crashed");
	});
});

describe("isDueSoon (M9)", () => {
	const DAY = 24 * 60 * 60 * 1000;

	it("is due when the payment becomes releasable within 7 days", () => {
		const paidAt = new Date(NOW.getTime() - 10 * DAY);
		expect(isDueSoon({ paidAt, createdAt: paidAt }, NOW)).toBe(true);
	});

	it("is not due when it becomes releasable later than 7 days from now", () => {
		const paidAt = new Date(NOW.getTime() - 2 * DAY);
		expect(isDueSoon({ paidAt, createdAt: paidAt }, NOW)).toBe(false);
	});
});
