import type { StatDelta } from "@/lib/stats/statDelta";

/** Data for the four student dashboard stat cards (FR1–FR7). */
export type StudentDashboardStats = {
	enrolledCourses: { total: number; delta: StatDelta }; // FR1/FR2
	hoursLearned: { totalMinutes: number; delta: StatDelta }; // FR3/FR4 — UI formats minutes → hours
	certificates: { total: number; delta: StatDelta }; // FR5/FR6
	completionRate: { percent: number }; // FR7 — 0..100, no delta
};

/** One row of the "Continue Learning" list (FR10–FR12). */
export type ContinueLearningItem = {
	courseId: string;
	courseTitle: string;
	progress: number; // 0..100, exclusive of both ends (FR10)
	nextLessonId: string; // resume deep-link target (FR12)
	nextLessonTitle: string; // FR11
};