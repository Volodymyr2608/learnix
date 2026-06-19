import { subDays } from "date-fns";
import { Role } from "@/generated/prisma";
import { env } from "@/lib/env";
import { computeDelta } from "@/lib/stats/computeDelta";
import type { InstructorSchemaInput } from "@/server/entities/instructor";
import type {
	ActivityEvent,
	DashboardStats,
	TopCourse,
} from "@/server/entities/instructor/dashboard";
import {
	type GetReviewStatsInput,
	type GetReviewsInput,
	type PaginatedReviews,
	type RatingDistributionBucket,
	REVIEWS_PER_PAGE,
	type ReviewCourseOption,
	type ReviewStats,
} from "@/server/entities/instructor/reviews";
import type {
	GetStudentsInput,
	PaginatedStudents,
	StudentStatusCounts,
} from "@/server/entities/instructor/students";
import { courseRepository } from "@/server/repositories/course.repository";
import { courseReviewRepository } from "@/server/repositories/courseReview.repository";
import { enrollmentRepository } from "@/server/repositories/enrollment.repository";
import { instructorRepository } from "@/server/repositories/instructor.repository";
import { paymentRepository } from "@/server/repositories/payment.repository";
import { authService } from "@/server/services/auth/auth.service";
import { emailService } from "@/server/services/email/email.service";
import { signUnsubscribeToken } from "@/server/services/email/unsubscribe-token";
import { InstructorError } from "@/server/services/instructor/instructor.errors";
import { userService } from "@/server/services/user/user.service";
import { logger } from "@/server/utils/logger";

const INACTIVE_DAYS = 7;
const STUDENTS_PER_PAGE = 10;

class InstructorService {
	async createInstructor(dto: InstructorSchemaInput) {
		let userId: string | undefined;

		try {
			await instructorRepository.transaction(async () => {
				const { email, fullName, password } = dto;
				const result = await authService.signUp({
					email,
					name: fullName,
					password,
				});
				userId = result.userId;

				await userService.setRole(userId, Role.INSTRUCTOR);

				return await instructorRepository.create({
					userId,
					courseIdea: dto.courseIdea,
					areaOfExpertise: dto.expertise,
					phone: dto.phone ?? null,
					professionalBio: dto.bio,
					teachingExperience: dto.experience,
					linkedinUrl: dto.linkedIn ?? null,
					websiteUrl: dto.website ?? null,
				});
			});
		} catch (error) {
			logger.error("Error creating instructor:", error);

			throw new InstructorError(
				"Failed to create instructor",
				"INTERNAL_SERVER_ERROR",
				error,
				{ dto },
			);
		}

		if (userId) {
			void (async () => {
				try {
					const token = await signUnsubscribeToken(userId);
					await emailService.send({
						templateKey: "instructor.welcome",
						toEmail: dto.email,
						userId,
						payload: {
							name: dto.fullName,
							portalUrl: `${env.BASE_URL}/instructor`,
							unsubscribeUrl: `${env.BASE_URL}/unsubscribe?token=${token}`,
						},
					});
				} catch (err) {
					logger.error("instructor welcome email failed", { error: err });
				}
			})();
		}
	}

	async getDashboardStats(instructorId: string): Promise<DashboardStats> {
		logger.info("Getting instructor dashboard stats", { instructorId });

		const [revenue, students, rating, courses] = await Promise.all([
			paymentRepository.getInstructorRevenueStats(instructorId),
			enrollmentRepository.getInstructorStudentStats(instructorId),
			courseReviewRepository.getInstructorRatingStats(instructorId),
			courseRepository.getCoursesStats(instructorId),
		]);

		return {
			revenue: {
				totalCents: revenue.lifetimeGrossCents,
				delta: computeDelta(
					revenue.thisMonthGrossCents,
					revenue.lastMonthGrossCents,
				),
			},
			students: {
				total: students.total,
				delta: computeDelta(students.thisMonthNew, students.lastMonthNew),
			},
			courses: { published: courses.published, drafts: courses.draft },
			rating: { average: rating.average, reviewCount: rating.reviewCount },
		};
	}

	async getTopPerformingCourses(
		instructorId: string,
		limit = 3,
	): Promise<TopCourse[]> {
		logger.info("Getting instructor top performing courses", { instructorId });

		const ranked = await paymentRepository.getRevenueGroupedByCourse(
			instructorId,
			new Date(0),
			limit,
		);
		if (ranked.length === 0) return [];

		const courseIds = ranked.map((r) => r.courseId);
		const [cards, ratings] = await Promise.all([
			courseRepository.getCourseCardsByIds(instructorId, courseIds),
			courseReviewRepository.getAvgRatingByCourseIds(courseIds),
		]);

		const rows: TopCourse[] = [];
		for (const { courseId, grossCents } of ranked) {
			const card = cards.get(courseId);
			if (!card) continue; // soft-deleted / not owned → drop
			rows.push({
				courseId,
				title: card.title,
				students: card.students,
				rating: ratings.get(courseId) ?? null,
				grossCents,
			});
		}

		rows.sort(
			(a, b) =>
				b.grossCents - a.grossCents ||
				b.students - a.students ||
				a.title.localeCompare(b.title),
		);
		return rows.slice(0, limit);
	}

	async getRecentActivity(
		instructorId: string,
		limit = 5,
	): Promise<ActivityEvent[]> {
		logger.info("Getting instructor recent activity", { instructorId });

		const [enrollments, reviews] = await Promise.all([
			enrollmentRepository.findRecentByInstructor(instructorId, limit),
			courseReviewRepository.findRecentByInstructor(instructorId, limit),
		]);

		const events: ActivityEvent[] = [
			...enrollments.map(
				(e): ActivityEvent => ({
					type: "enrollment",
					id: e.id,
					studentName: e.studentName,
					courseTitle: e.courseTitle,
					occurredAt: e.enrolledAt,
				}),
			),
			...reviews.map(
				(r): ActivityEvent => ({
					type: "review",
					id: r.id,
					studentName: r.studentName,
					courseTitle: r.courseTitle,
					rating: r.rating,
					occurredAt: r.createdAt,
				}),
			),
		];

		events.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
		return events.slice(0, limit);
	}

	async getStudents(
		instructorId: string,
		input: GetStudentsInput,
	): Promise<PaginatedStudents> {
		logger.info("Getting instructor students", { instructorId, ...input });

		const perPage = STUDENTS_PER_PAGE;
		const cutoff = subDays(new Date(), INACTIVE_DAYS);

		const { rows, total } = await enrollmentRepository.findInstructorStudents({
			instructorId,
			cutoff,
			q: input.q,
			status: input.status,
			courseId: input.courseId,
			sort: input.sort,
			page: input.page,
			perPage,
		});

		return {
			data: rows.map((r) => ({
				id: r.id,
				name: r.name,
				email: r.email,
				image: r.image,
				courses: r.courses,
				overallProgress: r.progress,
				lastActiveAt: r.last_active_at,
				joinedAt: r.joined_at,
				status: r.status,
			})),
			total,
			currentPage: input.page,
			perPage,
			lastPage: Math.max(1, Math.ceil(total / perPage)),
		};
	}

	async getStudentStatusCounts(
		instructorId: string,
	): Promise<StudentStatusCounts> {
		logger.info("Getting instructor student status counts", { instructorId });
		const cutoff = subDays(new Date(), INACTIVE_DAYS);
		return enrollmentRepository.getInstructorStudentStatusCounts(
			instructorId,
			cutoff,
		);
	}

	async getReviewCourseOptions(
		instructorId: string,
	): Promise<ReviewCourseOption[]> {
		logger.info("Getting instructor review course options", { instructorId });
		const options =
			await courseReviewRepository.getInstructorReviewCourseOptions(
				instructorId,
			);
		return options.sort((a, b) => a.title.localeCompare(b.title));
	}

	async getReviewStats(
		instructorId: string,
		input: GetReviewStatsInput,
	): Promise<ReviewStats> {
		logger.info("Getting instructor review stats", { instructorId, ...input });
		const s = await courseReviewRepository.getInstructorReviewStats(
			instructorId,
			input.courseId,
		);
		const distribution: RatingDistributionBucket[] = [5, 4, 3, 2, 1].map(
			(star) => {
				const count = s.perStar.get(star) ?? 0;
				return {
					star,
					count,
					percent: s.total > 0 ? (count / s.total) * 100 : 0,
				};
			},
		);
		return {
			average: s.average,
			total: s.total,
			fiveStarPercent:
				s.total > 0 ? Math.round((s.fiveStarCount / s.total) * 100) : 0,
			lowRatingCount: s.lowRatingCount,
			distribution,
		};
	}

	async getReviews(
		instructorId: string,
		input: GetReviewsInput,
	): Promise<PaginatedReviews> {
		logger.info("Getting instructor reviews", { instructorId, ...input });
		const { rows, total } = await courseReviewRepository.findInstructorReviews({
			instructorId,
			courseId: input.courseId,
			rating: input.rating,
			page: input.page,
			perPage: REVIEWS_PER_PAGE,
		});
		return {
			data: rows,
			total,
			currentPage: input.page,
			perPage: REVIEWS_PER_PAGE,
			lastPage: Math.max(1, Math.ceil(total / REVIEWS_PER_PAGE)),
		};
	}
}

export const instructorService = new InstructorService();
