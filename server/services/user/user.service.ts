import type { Role } from "@/generated/prisma";
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

	async setRole(userId: string, role: Role) {
		try {
			return await userRepository.update(userId, { role });
		} catch (error) {
			logger.error("Failed to set user role:", error);
			throw new UserError("Failed to set user role");
		}
	}

	/**
	 * Irreversibly anonymises an account in place. Called from Better Auth's
	 * `deleteUser.beforeDelete` hook (server/better-auth/config.ts); a throw here
	 * aborts the deletion request before anything is removed.
	 */
	async anonymiseAccount(userId: string) {
		try {
			return await userRepository.anonymiseAccount(userId);
		} catch (error) {
			logger.error("Failed to anonymise account:", error);
			// The cause is passed through: P2028 (transaction timeout) and P2002
			// (anonymised-email collision) need different operator responses.
			throw new UserError(
				"Failed to delete account",
				"INTERNAL_SERVER_ERROR",
				error,
			);
		}
	}
}

export const userService = new UserService();
