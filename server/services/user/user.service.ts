import type { Role } from "@/generated/prisma";
import type { UserUpdateDto } from "@/server/entities/user";
import { refundAppealRepository } from "@/server/repositories/refundAppeal.repository";
import { userRepository } from "@/server/repositories/user.repository";
import { refundEvidenceStorage } from "@/server/services/refund/refundEvidenceStorage";
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
			// FR-P23 / C29 (W11): the evidence blobs are a network call, so they are listed before
			// the transaction and deleted after it commits.
			const evidence =
				await refundAppealRepository.findEvidenceOfStudent(userId);
			const result = await userRepository.anonymiseAccount(userId);
			await this.deleteEvidence(evidence);
			return result;
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

	/** A failed delete is logged; the daily retention deletes the file 30 days after the closure. */
	private async deleteEvidence(files: { id: string; blobPathname: string }[]) {
		if (files.length === 0) return;
		try {
			await refundEvidenceStorage.del(files.map((f) => f.blobPathname));
			await refundAppealRepository.markEvidenceDeleted(
				files.map((f) => f.id),
				new Date(),
			);
		} catch (error) {
			logger.error("Evidence of a deleted account could not be deleted yet", {
				error,
			});
		}
	}
}

export const userService = new UserService();
