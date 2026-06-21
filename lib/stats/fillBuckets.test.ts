import { afterEach, describe, expect, it } from "vitest";
import { fillBuckets } from "./fillBuckets";

describe("fillBuckets", () => {
	it("fills missing months with the empty template, keyed by month", () => {
		const now = new Date("2026-03-15T00:00:00Z");
		const since = new Date("2026-01-01T00:00:00Z");
		const rows = [{ period: new Date("2026-02-01T00:00:00Z"), enrollments: 5 }];

		const out = fillBuckets(rows, since, now, "month", { enrollments: 0 });

		expect(out).toHaveLength(3);
		expect(out.map((r) => r.enrollments)).toEqual([0, 5, 0]);
		expect(out[1]?.period).toBe("2026-02-01");
	});

	describe("server timezone independence", () => {
		const originalTZ = process.env.TZ;

		afterEach(() => {
			process.env.TZ = originalTZ;
		});

		it("keys a UTC-midnight period into the correct month even west of UTC", () => {
			// America/New_York is behind UTC, so a naive local-getter read of a
			// UTC-midnight Date rolls back to the previous calendar day/month.
			process.env.TZ = "America/New_York";

			// since/now are local-anchored, exactly as resolveRange builds them;
			// period is UTC-anchored, exactly as a date_trunc() row arrives.
			const now = new Date(2026, 2, 15); // local Mar 15
			const since = new Date(2026, 0, 1); // local Jan 1 → Jan, Feb, Mar window
			const rows = [
				{ period: new Date("2026-02-01T00:00:00Z"), enrollments: 5 },
			];

			const out = fillBuckets(rows, since, now, "month", { enrollments: 0 });

			expect(out.map((r) => r.enrollments)).toEqual([0, 5, 0]);
			expect(out[1]?.period).toBe("2026-02-01");
		});
	});

	it("returns an empty day-bucket series instead of a reversed interval when since equals now", () => {
		const now = new Date("2026-03-15T12:00:00Z");

		const out = fillBuckets([], now, now, "day", { enrollments: 0 });

		expect(out).toEqual([]);
	});
});
