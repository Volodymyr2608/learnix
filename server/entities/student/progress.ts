import type { StatDelta } from "@/lib/stats/statDelta";

/** One day in the trailing-7-day Weekly Activity chart (FR7). */
export type WeeklyActivityDay = {
	date: string; // yyyy-MM-dd (server local)
	weekday: string; // "Mon".."Sun"
	minutes: number; // total duration of lessons completed that day (0 if none)
};

/** Everything the progress page renders (FR1–FR7). */
export type StudentProgressStats = {
	totalMinutes: number; // lifetime; UI formats to hours (FR1)
	totalHoursDelta: StatDelta; // trailing 7d vs prior 7d (FR2)
	coursesCompleted: { total: number; delta: StatDelta }; // FR3/FR4
	currentStreakDays: number; // FR5
	avgDailyMinutes: number; // mean of weeklyActivity minutes (FR6)
	weeklyActivity: WeeklyActivityDay[]; // exactly 7 entries, oldest→newest (FR7)
};
