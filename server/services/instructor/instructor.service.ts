import { Role } from "@/generated/prisma";
import { env } from "@/lib/env";
import { computeDelta } from "@/lib/stats/computeDelta";
import type { InstructorSchemaInput } from "@/server/entities/instructor";
import type {
	ActivityEvent,
	DashboardStats,
	TopCourse,
} from "@/server/entities/instructor/dashboard";
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
}

export const instructorService = new InstructorService();
