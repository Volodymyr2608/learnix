import type { StatDelta } from "@/lib/stats/statDelta";

const deltaDirection = (value: number) => {
	if (value > 0) return "up";
	if (value < 0) return "down";
	return "flat";
};

/** Month-over-month delta with explicit zero-period handling (FR2/FR4). */
export function computeDelta(current: number, previous: number): StatDelta {
	if (previous === 0) {
		return current > 0 ? { kind: "new" } : { kind: "none" };
	}
	const value = Math.round(((current - previous) / previous) * 100);
	return { kind: "percent", value, direction: deltaDirection(value) };
}
