// lib/stats/monthWindows.ts
export type MonthWindows = {
	startThisMonth: Date;
	startLastMonth: Date;
	startNextMonth: Date;
};

/** Calendar-month boundaries (server local time) for month-over-month deltas. */
export function getMonthWindows(now: Date = new Date()): MonthWindows {
	const year = now.getFullYear();
	const month = now.getMonth();
	return {
		startThisMonth: new Date(year, month, 1),
		startLastMonth: new Date(year, month - 1, 1),
		startNextMonth: new Date(year, month + 1, 1),
	};
}
