import { Role } from "@/generated/prisma";
import { env } from "@/lib/env";
import type { InstructorSchemaInput } from "@/server/entities/instructor";
import { instructorRepository } from "@/server/repositories/instructor.repository";
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
}

export const instructorService = new InstructorService();
