import { describe, expect, it } from "vitest";
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
});
