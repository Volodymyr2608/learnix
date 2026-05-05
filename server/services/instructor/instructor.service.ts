import { Role } from "@/generated/prisma";
import type { InstructorSchemaInput } from "@/server/entities/instructor";
import { instructorRepository } from "@/server/repositories/instructor.repository";
import { authService } from "@/server/services/auth/auth.service";
import { InstructorError } from "@/server/services/instructor/instructor.errors";
import { userService } from "@/server/services/user/user.service";
import { logger } from "@/server/utils/logger";

class InstructorService {
	async createInstructor(dto: InstructorSchemaInput) {
		try {
			await instructorRepository.transaction(async () => {
				const { email, fullName, password } = dto;
				const { userId } = await authService.signUp({
					email,
					name: fullName,
					password,
				});

				await userService.updateUser(userId, {
					role: Role.INSTRUCTOR,
				});

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
	}
}

export const instructorService = new InstructorService();
