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

	async getEnrollmentsByCourse(
		courseIds: string[],
		since: Date,
	): Promise<{ courseId: string; title: string; enrollments: number }[]> {
		if (courseIds.length === 0) return [];
		const grouped = await db.enrollment.groupBy({
			by: ["courseId"],
			where: { courseId: { in: courseIds }, enrolledAt: { gte: since } },
			_count: { _all: true },
			orderBy: { _count: { courseId: "desc" } },
		});
		if (grouped.length === 0) return [];
		const courses = await db.course.findMany({
			where: { id: { in: grouped.map((g) => g.courseId) } },
			select: { id: true, title: true },
		});
		const titleById = new Map(courses.map((c) => [c.id, c.title]));
		return grouped.map((g) => ({
			courseId: g.courseId,
			title: titleById.get(g.courseId) ?? "Untitled course",
			enrollments: g._count._all,
		}));
	}

	/** lessonId → number of students who completed it (for the funnel). */
	async getLessonCompletions(courseId: string): Promise<Map<string, number>> {
		const grouped = await db.lessonProgress.groupBy({
			by: ["lessonId"],
			where: {
				isCompleted: true,
				lesson: { section: { courseId } },
			},
			_count: { _all: true },
		});
		return new Map(grouped.map((g) => [g.lessonId, g._count._all]));
	}
}

export const analyticsRepository = new AnalyticsRepository();
