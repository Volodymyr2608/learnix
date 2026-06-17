/** Month-over-month change for a stat card. */
export type StatDelta =
	| { kind: "percent"; value: number; direction: "up" | "down" | "flat" }
	| { kind: "new" } // prior period 0, current > 0
	| { kind: "none" }; // nothing to compare (both periods 0)
