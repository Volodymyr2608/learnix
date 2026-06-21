import { computeDelta } from "@/lib/stats/computeDelta";
import { fillBuckets } from "@/lib/stats/fillBuckets";
import { getMonthWindows } from "@/lib/stats/monthWindows";
import { resolveRange } from "@/lib/stats/revenueRange";
import type {
	AnalyticsSummary,
	CompletionTrendPoint,
	EnrollmentsByCourseItem,
	EnrollmentTrendPoint,
} from "@/server/entities/analytics/analytics";
import type { StatsRange } from "@/server/entities/stats/range";
import { analyticsRepository } from "@/server/repositories/analytics.repository";
import { logger } from "@/server/utils/logger";

class AnalyticsService {
	private async buildSummary(courseIds: string[]): Promise<AnalyticsSummary> {
		const now = new Date();
		const { startThisMonth, startLastMonth, startNextMonth } =
			getMonthWindows(now);
		const thisMonth = { gte: startThisMonth, lt: startNextMonth };
		const lastMonth = { gte: startLastMonth, lt: startThisMonth };

		const [
			enrollTotal,
			enrollThis,
			enrollLast,
			activeThis,
			activeLast,
			avgProgress,
			quizThis,
			quizLast,
			quizAll,
		] = await Promise.all([
			analyticsRepository.countEnrollments(courseIds),
			analyticsRepository.countEnrollments(courseIds, thisMonth),
			analyticsRepository.countEnrollments(courseIds, lastMonth),
			analyticsRepository.countActiveLearners(courseIds, thisMonth),
			analyticsRepository.countActiveLearners(courseIds, lastMonth),
			analyticsRepository.getAvgProgress(courseIds),
			analyticsRepository.getQuizStats(courseIds, thisMonth),
			analyticsRepository.getQuizStats(courseIds, lastMonth),
			analyticsRepository.getQuizStats(courseIds),
		]);

		const rate = (s: { attempts: number; correct: number }) =>
			s.attempts === 0 ? 0 : Math.round((s.correct / s.attempts) * 100);

		return {
			enrollments: {
				value: enrollTotal,
				delta: computeDelta(enrollThis, enrollLast),
			},
			activeLearners: {
				value: activeThis,
				delta: computeDelta(activeThis, activeLast),
			},
			avgProgress: { value: avgProgress, delta: { kind: "none" } },
			quizPassRate: {
				value: rate(quizAll),
				attempts: quizAll.attempts,
				delta: computeDelta(rate(quizThis), rate(quizLast)),
			},
		};
	}

	async getOverviewSummary(instructorId: string): Promise<AnalyticsSummary> {
		logger.info("Getting instructor analytics overview", { instructorId });
		const courseIds =
			await analyticsRepository.getInstructorCourseIds(instructorId);
		return this.buildSummary(courseIds);
	}

	async getEnrollmentTrend(
		instructorId: string,
		range: StatsRange,
	): Promise<EnrollmentTrendPoint[]> {
		const courseIds =
			await analyticsRepository.getInstructorCourseIds(instructorId);
		return this.enrollmentTrendFor(courseIds, range);
	}

	async getCompletionTrend(
		instructorId: string,
		range: StatsRange,
	): Promise<CompletionTrendPoint[]> {
		const trend = await this.getEnrollmentTrend(instructorId, range);
		return trend.map((p) => ({
			period: p.period,
			rate:
				p.enrollments === 0
					? 0
					: Math.round((p.completions / p.enrollments) * 100),
		}));
	}

	async getEnrollmentsByCourse(
		instructorId: string,
		range: StatsRange,
	): Promise<EnrollmentsByCourseItem[]> {
		const { since } = resolveRange(range);
		const courseIds =
			await analyticsRepository.getInstructorCourseIds(instructorId);
		return analyticsRepository.getEnrollmentsByCourse(courseIds, since);
	}

	protected async enrollmentTrendFor(
		courseIds: string[],
		range: StatsRange,
	): Promise<EnrollmentTrendPoint[]> {
		const now = new Date();
		const { since, bucket } = resolveRange(range, now);
		const rows = await analyticsRepository.getEnrollmentTrend(
			courseIds,
			since,
			bucket,
		);
		return fillBuckets(rows, since, now, bucket, {
			enrollments: 0,
			completions: 0,
		});
	}
}

export const analyticsService = new AnalyticsService();
