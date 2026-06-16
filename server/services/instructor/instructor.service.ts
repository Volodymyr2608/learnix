import { Role } from "@/generated/prisma";
import { env } from "@/lib/env";
import { computeDelta } from "@/lib/stats/computeDelta";
import type { InstructorSchemaInput } from "@/server/entities/instructor";
import type { DashboardStats } from "@/server/entities/instructor/dashboard";
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
}

export const instructorService = new InstructorService();
