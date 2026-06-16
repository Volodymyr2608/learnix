/** Month-over-month change for a stat card. */
export type StatDelta =
	| { kind: "percent"; value: number; direction: "up" | "down" | "flat" }
	| { kind: "new" } // prior period 0, current > 0
	| { kind: "none" }; // nothing to compare (both periods 0)

/** All data needed to render the four instructor dashboard stat cards. */
export type DashboardStats = {
	revenue: { totalCents: number; delta: StatDelta };
	students: { total: number; delta: StatDelta };
	courses: { published: number; drafts: number };
	rating: { average: number | null; reviewCount: number };
};
