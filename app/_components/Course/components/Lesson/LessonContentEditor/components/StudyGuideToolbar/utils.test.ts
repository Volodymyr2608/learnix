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
	 * a three-month-old guide rendered "129,188 minutes ago". Across the range a
	 * study guide can plausibly span, no label may carry a count that large —
	 * under the old code six of these nine distances did.
	 */
	it("never renders a three-or-more-digit count across a guide's plausible age", () => {
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

	/**
	 * date-fns throws RangeError on an invalid date, and this runs inside a React
	 * render — an unparseable value would blank the whole lesson editor rather
	 * than one line of it.
	 */
	it("says so plainly instead of throwing on an unparseable value", () => {
		expect(lastGeneratedLabel("not a date")).toBe("at an unknown time");
		expect(lastGeneratedLabel(new Date(Number.NaN))).toBe("at an unknown time");
	});

	it("does not render the future when the browser clock trails the server", () => {
		const thirtySecondsAhead = new Date(Date.now() + 30_000);

		expect(lastGeneratedLabel(thirtySecondsAhead)).toBe(
			"less than a minute ago",
		);
	});
});
