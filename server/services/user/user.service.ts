import type { UserCreateDto } from "@/server/entities/user";
import { userRepository } from "@/server/repositories/user.repository";
import { UserError } from "@/server/services/user/user.errors";
import { logger } from "@/server/utils/logger";

class UserService {
	async createUser(dto: UserCreateDto) {
		try {
			return await userRepository.create(dto);
		} catch (error) {
			logger.error("Failed to create user:", error);
			throw new UserError("Failed to create user");
		}
	}
}

export const userService = new UserService();
