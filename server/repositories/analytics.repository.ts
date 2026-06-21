import { db } from "@/server/db";

type Window = { gte: Date; lt: Date };

class AnalyticsRepository {
	/** The instructor's non-deleted course ids. */
	async getInstructorCourseIds(instructorId: string): Promise<string[]> {
		const rows = await db.course.findMany({
			where: { instructorId, deletedAt: null },
			select: { id: true },
		});
		return rows.map((r) => r.id);
	}

	async countEnrollments(
		courseIds: string[],
		window?: Window,
	): Promise<number> {
		if (courseIds.length === 0) return 0;
		return db.enrollment.count({
			where: {
				courseId: { in: courseIds },
				...(window ? { enrolledAt: { gte: window.gte, lt: window.lt } } : {}),
			},
		});
	}

	async countActiveLearners(
		courseIds: string[],
		window: Window,
	): Promise<number> {
		if (courseIds.length === 0) return 0;
		return db.enrollment.count({
			where: {
				courseId: { in: courseIds },
				lastAccessedAt: { gte: window.gte, lt: window.lt },
			},
		});
	}

	async getAvgProgress(courseIds: string[]): Promise<number> {
		if (courseIds.length === 0) return 0;
		const agg = await db.enrollment.aggregate({
			where: { courseId: { in: courseIds } },
			_avg: { progress: true },
		});
		return Math.round(agg._avg.progress ?? 0);
	}

	async getQuizStats(
		courseIds: string[],
		window?: Window,
	): Promise<{ attempts: number; correct: number }> {
		if (courseIds.length === 0) return { attempts: 0, correct: 0 };
		const where = {
			quiz: { lesson: { section: { courseId: { in: courseIds } } } },
			...(window ? { createdAt: { gte: window.gte, lt: window.lt } } : {}),
		};
		const [attempts, correct] = await Promise.all([
			db.quizAttempt.count({ where }),
			db.quizAttempt.count({ where: { ...where, isCorrect: true } }),
		]);
		return { attempts, correct };
	}

	async getEnrollmentTrend(
		courseIds: string[],
		since: Date,
		bucket: "day" | "month",
	): Promise<{ period: Date; enrollments: number; completions: number }[]> {
		if (courseIds.length === 0) return [];
		const rows = await db.$queryRaw<
			{ period: Date; enrollments: bigint; completions: bigint }[]
		>`
			SELECT date_trunc(${bucket}, "enrolledAt") AS period,
			       COUNT(*) AS enrollments,
			       COUNT("completedAt") AS completions
			FROM enrollments
			WHERE "courseId" = ANY(${courseIds})
			  AND "enrolledAt" >= ${since}
			GROUP BY period
			ORDER BY period ASC
		`;
		return rows.map((r) => ({
			period: r.period,
			enrollments: Number(r.enrollments),
			completions: Number(r.completions),
		}));
	}
}

export const analyticsRepository = new AnalyticsRepository();
