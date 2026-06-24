import { skillRepository } from "@/server/repositories/skill.repository";
import { logger } from "@/server/utils/logger";
import { SkillError } from "./skill.service.errors";

class SkillService {
	async list() {
		try {
			return await skillRepository.listAll();
		} catch (error) {
			logger.error("Failed to list skills:", error);
			throw new SkillError(
				"Failed to list skills",
				"INTERNAL_SERVER_ERROR",
				error,
			);
		}
	}
}

export const skillService = new SkillService();
