import { describe, expect, it } from "vitest";
import { lastGeneratedLabel } from "./utils";

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);
const daysAgo = (n: number) => minutesAgo(n * 60 * 24);

describe("lastGeneratedLabel", () => {
	it("reads in minutes for a recent generation", () => {
		expect(lastGeneratedLabel(minutesAgo(3))).toBe("3 minutes ago");
	});

	it("reads in months for a generation 90 days old", () => {
		expect(lastGeneratedLabel(daysAgo(90))).toContain("months");
	});

	/**
	 * The bug this replaces: the previous formatter was hardcoded to "minute", so
	 * a three-month-old guide rendered "129,188 minutes ago". No elapsed distance
	 * may produce a count that large, whatever the unit.
	 */
	it("never renders a count of three or more digits, at any distance", () => {
		const distances = [
			minutesAgo(0),
			minutesAgo(1),
			minutesAgo(59),
			minutesAgo(90),
			daysAgo(1),
			daysAgo(30),
			daysAgo(90),
			daysAgo(400),
			daysAgo(3000),
		];

		for (const date of distances) {
			expect(lastGeneratedLabel(date)).not.toMatch(/\d{3,}/);
		}
	});

	it("accepts the ISO string a tRPC payload may carry instead of a Date", () => {
		expect(lastGeneratedLabel(minutesAgo(3).toISOString())).toBe(
			"3 minutes ago",
		);
	});
});
