import type { LessonProgress, Prisma } from "@/generated/prisma";
import { getWeekWindows } from "@/lib/stats/getWeekWindows";
import { getMonthWindows } from "@/lib/stats/monthWindows";
import { BaseRepository } from "./base/base.repository";

class LessonProgressRepository extends BaseRepository<
	"lessonProgress",
	LessonProgress,
	Prisma.LessonProgressUncheckedCreateInput,
	Prisma.LessonProgressUpdateInput,
	Prisma.LessonProgressWhereInput,
	Prisma.LessonProgressInclude,
	Prisma.LessonProgressSelect,
	Prisma.LessonProgressOrderByWithRelationInput
> {
	protected readonly modelName = "lessonProgress" as const;

	findCompletedByLessonIds(studentId: string, lessonIds: string[]) {
		return this.findMany({
			where: {
				studentId,
				lessonId: { in: lessonIds },
				isCompleted: true,
			},
			orderBy: { updatedAt: "desc" },
			select: { lessonId: true, updatedAt: true },
		});
	}

	countCompleted(studentId: string, courseId: string) {
		return this.count({
			studentId,
			isCompleted: true,
			lesson: { section: { courseId }, deletedAt: null },
		} as Prisma.LessonProgressWhereInput);
	}

	/** A11: live completions + lessons archived by refunds. */
	async countCompletedTotal(studentId: string): Promise<number> {
		const [live, archived] = await Promise.all([
			this.count({ studentId, isCompleted: true }),
			this.db.studyArchive.aggregate({
				where: { studentId },
				_sum: { lessons: true },
			}),
		]);
		return live + (archived._sum.lessons ?? 0);
	}

	async findCompletedIds(
		studentId: string,
		courseId: string,
	): Promise<string[]> {
		const rows = await this.findMany({
			where: {
				studentId,
				isCompleted: true,
				lesson: { section: { courseId } },
			},
			select: { lessonId: true },
		});
		return rows.map((r) => (r as { lessonId: string }).lessonId);
	}

	async getCompletedMinutesTotals(studentId: string): Promise<{
		lifetimeMinutes: number;
		thisWeekMinutes: number;
		priorWeekMinutes: number;
	}> {
		const { startThisWeek, startPriorWeek } = getWeekWindows();
		const rows = await this.db.$queryRaw<
			[{ lifetime: number; this_week: number; prior_week: number }]
		>`
			SELECT
				COALESCE(SUM(lp.duration_minutes), 0)::int AS lifetime,
				COALESCE(SUM(lp.duration_minutes) FILTER (
					WHERE lp."completedAt" >= ${startThisWeek}), 0)::int AS this_week,
				COALESCE(SUM(lp.duration_minutes) FILTER (
					WHERE lp."completedAt" >= ${startPriorWeek}
						AND lp."completedAt" < ${startThisWeek}), 0)::int AS prior_week
			FROM (
				SELECT l.duration_minutes, lp."completedAt"
				  FROM lesson_progress lp
				  JOIN lessons l ON l.id = lp."lessonId"
				 WHERE lp."studentId" = ${studentId} AND lp."isCompleted" = true
				UNION ALL
				-- A11: minutes archived by refunds, filed at the UTC day they were earned.
				SELECT a.minutes, a.day FROM study_archive a WHERE a.student_id = ${studentId}
			) AS lp ("duration_minutes", "completedAt")
		`;
		const r = rows[0];
		return {
			lifetimeMinutes: Number(r?.lifetime ?? 0),
			thisWeekMinutes: Number(r?.this_week ?? 0),
			priorWeekMinutes: Number(r?.prior_week ?? 0),
		};
	}

	async getStudentLessonStats(studentId: string): Promise<{
		lifetimeMinutes: number;
		thisMonthMinutes: number;
		lastMonthMinutes: number;
	}> {
		const { startThisMonth, startLastMonth, startNextMonth } =
			getMonthWindows();
		const rows = await this.db.$queryRaw<
			[{ lifetime: number; this_month: number; last_month: number }]
		>`
			SELECT
				COALESCE(SUM(lp.duration_minutes), 0)::int AS lifetime,
				COALESCE(SUM(lp.duration_minutes) FILTER (
					WHERE lp."completedAt" >= ${startThisMonth}
						AND lp."completedAt" < ${startNextMonth}), 0)::int AS this_month,
				COALESCE(SUM(lp.duration_minutes) FILTER (
					WHERE lp."completedAt" >= ${startLastMonth}
						AND lp."completedAt" < ${startThisMonth}), 0)::int AS last_month
			FROM (
				SELECT l.duration_minutes, lp."completedAt"
				  FROM lesson_progress lp
				  JOIN lessons l ON l.id = lp."lessonId"
				 WHERE lp."studentId" = ${studentId} AND lp."isCompleted" = true
				UNION ALL
				SELECT a.minutes, a.day FROM study_archive a WHERE a.student_id = ${studentId}
			) AS lp ("duration_minutes", "completedAt")
		`;
		const r = rows[0];
		return {
			lifetimeMinutes: Number(r?.lifetime ?? 0),
			thisMonthMinutes: Number(r?.this_month ?? 0),
			lastMonthMinutes: Number(r?.last_month ?? 0),
		};
	}

	async getDailyCompletedMinutes(
		studentId: string,
		since: Date,
	): Promise<{ day: Date; minutes: number }[]> {
		const rows = await this.db.$queryRaw<{ day: Date; minutes: number }[]>`
			SELECT date_trunc('day', d."completedAt") AS day,
			       COALESCE(SUM(d.minutes), 0)::int AS minutes
			FROM (
				SELECT lp."completedAt", l.duration_minutes AS minutes
				  FROM lesson_progress lp
				  JOIN lessons l ON l.id = lp."lessonId"
				 WHERE lp."studentId" = ${studentId}
				   AND lp."isCompleted" = true
				   AND lp."completedAt" >= ${since}
				UNION ALL
				SELECT a.day, a.minutes FROM study_archive a
				 WHERE a.student_id = ${studentId} AND a.lessons > 0 AND a.day >= ${since}
			) AS d
			GROUP BY 1
		`;
		return rows.map((r) => ({ day: r.day, minutes: Number(r.minutes) }));
	}

	async getCompletionDays(studentId: string): Promise<Date[]> {
		const rows = await this.db.$queryRaw<{ day: Date }[]>`
			SELECT DISTINCT day FROM (
				SELECT date_trunc('day', lp."completedAt") AS day
				  FROM lesson_progress lp
				 WHERE lp."studentId" = ${studentId}
				   AND lp."isCompleted" = true
				   AND lp."completedAt" IS NOT NULL
				UNION ALL
				-- A11: days archived by refunds; a correct-answers-only row is not a study day.
				SELECT a.day FROM study_archive a
				 WHERE a.student_id = ${studentId} AND a.lessons > 0
			) AS days
			ORDER BY day DESC
		`;
		return rows.map((r) => r.day);
	}
}

export const lessonProgressRepository = new LessonProgressRepository();
