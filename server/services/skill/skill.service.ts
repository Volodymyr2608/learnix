import { skillRepository } from "@/server/repositories/skill.repository";

class SkillService {
	async list() {
		return skillRepository.listAll();
	}
}

export const skillService = new SkillService();
