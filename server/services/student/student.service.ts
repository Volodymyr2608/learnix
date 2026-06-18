import { addDays, format, isEqual, startOfDay, subDays } from "date-fns";
import { computeDelta } from "@/lib/stats/computeDelta";
import { getWeekWindows } from "@/lib/stats/getWeekWindows";
import type {
	ContinueLearningItem,
	StudentDashboardStats,
} from "@/server/entities/student/dashboard";
import type {
	StudentProgressStats,
	WeeklyActivityDay,
} from "@/server/entities/student/progress";
import { enrollmentRepository } from "@/server/repositories/enrollment.repository";
import { lessonRepository } from "@/server/repositories/lesson.repository";
import { lessonProgressRepository } from "@/server/repositories/lessonProgress.repository";
import { logger } from "@/server/utils/logger";

const WEEK_DAYS = 7;

class StudentService {
	async getProgressStats(studentId: string): Promise<StudentProgressStats> {
		logger.info("Getting student progress stats", { studentId });
		const { startThisWeek } = getWeekWindows();

		const [totals, daily, completionDays, completion] = await Promise.all([
			lessonProgressRepository.getCompletedMinutesTotals(studentId),
			lessonProgressRepository.getDailyCompletedMinutes(
				studentId,
				startThisWeek,
			),
			lessonProgressRepository.getCompletionDays(studentId),
			enrollmentRepository.getStudentCompletionStats(studentId),
		]);

		const weeklyActivity = this.buildWeek(startThisWeek, daily);
		const weekTotal = weeklyActivity.reduce((sum, d) => sum + d.minutes, 0);

		return {
			totalMinutes: totals.lifetimeMinutes,
			totalHoursDelta: computeDelta(
				totals.thisWeekMinutes,
				totals.priorWeekMinutes,
			),
			coursesCompleted: {
				total: completion.total,
				delta: computeDelta(completion.thisMonthNew, completion.lastMonthNew),
			},
			currentStreakDays: this.computeStreak(completionDays),
			avgDailyMinutes: Math.round(weekTotal / WEEK_DAYS),
			weeklyActivity,
		};
	}

	private buildWeek(
		startThisWeek: Date,
		daily: { day: Date; minutes: number }[],
	): WeeklyActivityDay[] {
		const byKey = new Map(
			daily.map((d) => [format(startOfDay(d.day), "yyyy-MM-dd"), d.minutes]),
		);
		const days: WeeklyActivityDay[] = [];
		for (let i = 0; i < WEEK_DAYS; i++) {
			const day = addDays(startThisWeek, i);
			const key = format(day, "yyyy-MM-dd");
			days.push({
				date: key,
				weekday: format(day, "EEE"),
				minutes: byKey.get(key) ?? 0,
			});
		}
		return days;
	}

	async getDashboardStats(studentId: string): Promise<StudentDashboardStats> {
		logger.info("Getting student dashboard stats", { studentId });
		const [enrollment, completion, lessons] = await Promise.all([
			enrollmentRepository.getStudentEnrollmentStats(studentId),
			enrollmentRepository.getStudentCompletionStats(studentId),
			lessonProgressRepository.getStudentLessonStats(studentId),
		]);

		const percent =
			enrollment.total === 0
				? 0
				: Math.round((completion.total / enrollment.total) * 100);

		return {
			enrolledCourses: {
				total: enrollment.active,
				delta: computeDelta(enrollment.thisMonthNew, enrollment.lastMonthNew),
			},
			hoursLearned: {
				totalMinutes: lessons.lifetimeMinutes,
				delta: computeDelta(lessons.thisMonthMinutes, lessons.lastMonthMinutes),
			},
			certificates: {
				total: completion.total,
				delta: computeDelta(completion.thisMonthNew, completion.lastMonthNew),
			},
			completionRate: { percent },
		};
	}

	async getContinueLearning(
		studentId: string,
		limit = 3,
	): Promise<ContinueLearningItem[]> {
		logger.info("Getting student continue-learning list", { studentId });
		const inProgress = await enrollmentRepository.findInProgressForContinue(
			studentId,
			limit,
		);
		if (inProgress.length === 0) return [];

		const courseIds = inProgress.map((e) => e.courseId);
		const orderedLessons =
			await lessonRepository.findOrderedLessonIdsByCourseIds(courseIds);
		const completed = await lessonProgressRepository.findCompletedByLessonIds(
			studentId,
			orderedLessons.map((l) => l.lessonId),
		);
		const completedIds = new Set(
			completed.map((c) => (c as { lessonId: string }).lessonId),
		);

		const lessonsByCourse = new Map<
			string,
			{ lessonId: string; title: string }[]
		>();
		for (const l of orderedLessons) {
			const list = lessonsByCourse.get(l.courseId) ?? [];
			list.push({ lessonId: l.lessonId, title: l.title });
			lessonsByCourse.set(l.courseId, list);
		}

		const items: ContinueLearningItem[] = [];
		for (const e of inProgress) {
			const lessons = lessonsByCourse.get(e.courseId) ?? [];
			const next = lessons.find((l) => !completedIds.has(l.lessonId));
			if (!next) continue; // no incomplete lesson → drop (FR-risk row)
			items.push({
				courseId: e.courseId,
				courseTitle: e.courseTitle,
				progress: e.progress,
				nextLessonId: next.lessonId,
				nextLessonTitle: next.title,
			});
		}
		return items;
	}

	private computeStreak(completionDays: Date[]): number {
		if (completionDays.length === 0) return 0;
		const days = completionDays.map((d) => startOfDay(d));
		const mostRecent = days[0];
		if (!mostRecent) return 0;
		const today = startOfDay(new Date());
		const yesterday = subDays(today, 1);

		let cursor: Date;
		if (isEqual(mostRecent, today)) cursor = today;
		else if (isEqual(mostRecent, yesterday)) cursor = yesterday;
		else return 0;

		let streak = 0;
		for (const day of days) {
			if (isEqual(day, cursor)) {
				streak += 1;
				cursor = subDays(cursor, 1);
			} else if (day < cursor) {
				break;
			}
		}
		return streak;
	}
}

export const studentService = new StudentService();
