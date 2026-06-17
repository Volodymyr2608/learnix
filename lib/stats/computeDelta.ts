import type { StatDelta } from "@/lib/stats/statDelta";

/** Month-over-month delta with explicit zero-period handling (FR2/FR4). */
export function computeDelta(current: number, previous: number): StatDelta {
	if (previous === 0) {
		return current > 0 ? { kind: "new" } : { kind: "none" };
	}
	const value = Math.round(((current - previous) / previous) * 100);
	const direction = value > 0 ? "up" : value < 0 ? "down" : "flat";
	return { kind: "percent", value, direction };
}
