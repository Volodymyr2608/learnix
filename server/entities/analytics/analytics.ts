import type { StatDelta } from "@/lib/stats/statDelta";

/** A summary stat: a numeric value plus a month-over-month delta. */
export type Metric = { value: number; delta: StatDelta };

/** The four summary cards (global or per-course). */
export type AnalyticsSummary = {
	/** All-time enrollment count; delta = this month's new vs last month's. */
	enrollments: Metric;
	/** Enrollments with lastAccessedAt this month; delta vs last month. */
	activeLearners: Metric;
	/** Current average enrollment progress (0..100); delta always {kind:"none"} (no history stored). */
	avgProgress: Metric;
	/** Quiz pass rate (0..100); delta = this month's vs last month's. attempts===0 → render "—". */
	quizPassRate: Metric & { attempts: number };
};

export type CourseAnalyticsSummary = AnalyticsSummary;

/** One point of the enrollments+completions area chart. period = ISO date (bucket start). */
export type EnrollmentTrendPoint = {
	period: string;
	enrollments: number;
	completions: number;
};

/** One point of the completion-rate line chart. rate = completions/enrollments * 100, 0..100. */
export type CompletionTrendPoint = { period: string; rate: number };

/** One slice of the enrollments-by-course pie. */
export type EnrollmentsByCourseItem = {
	courseId: string;
	title: string;
	enrollments: number;
};

/** One lesson in the per-course completion funnel, in course order. */
export type LessonFunnelItem = {
	lessonId: string;
	title: string;
	order: number;
	enrolled: number;
	completed: number;
};
