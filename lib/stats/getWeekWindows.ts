import { startOfDay, subDays } from "date-fns";

export type WeekWindows = {
	startThisWeek: Date; // start of the trailing 7-day window (today - 6 days)
	startPriorWeek: Date; // start of the 7 days before that
};

/** Trailing 7-day boundaries (server local time) for week-over-week deltas. */
export function getWeekWindows(now: Date = new Date()): WeekWindows {
	const startThisWeek = startOfDay(subDays(now, 6));
	return { startThisWeek, startPriorWeek: subDays(startThisWeek, 7) };
}
