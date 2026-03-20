import type { UserUpdateDto } from "@/server/entities/user";
import { userRepository } from "@/server/repositories/user.repository";
import { UserError } from "@/server/services/user/user.errors";
import { logger } from "@/server/utils/logger";

class UserService {
	async updateUser(userId: string, dto: UserUpdateDto) {
		try {
			return await userRepository.update(userId, dto);
		} catch (error) {
			logger.error("Failed to update user:", error);
			throw new UserError("Failed to update user");
		}
	}
}

export const userService = new UserService();
