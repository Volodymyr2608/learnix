import { Role } from "@/generated/prisma";
import type { InstructorSchemaInput } from "@/server/entities/instructor";
import { instructorRepository } from "@/server/repositories/instructor.repository";
import { InstructorError } from "@/server/services/instructor/instructor.errors";
import { userService } from "@/server/services/user/user.service";
import { logger } from "@/server/utils/logger";

class InstructorService {
	async createInstructor(dto: InstructorSchemaInput) {
		try {
			return instructorRepository.transaction(async () => {
				const { email, fullName } = dto;
				const user = await userService.createUser({
					email,
					name: fullName,
					role: Role.INSTRUCTOR,
				});

				return await instructorRepository.create({
					userId: user.id,
					courseIdea: dto.courseIdea,
					areaOfExpertise: dto.expertise,
					phone: dto.phone,
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
				{ cause: error },
				{ dto },
			);
		}
	}
}

export const instructorService = new InstructorService();
