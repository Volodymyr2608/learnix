import type { Prisma, Skill } from "@/generated/prisma";
import { BaseRepository } from "./base/base.repository";

class SkillRepository extends BaseRepository<
	"skill",
	Skill,
	Prisma.SkillUncheckedCreateInput,
	Prisma.SkillUpdateInput,
	Prisma.SkillWhereInput,
	Prisma.SkillInclude,
	Prisma.SkillSelect,
	Prisma.SkillOrderByWithRelationInput
> {
	protected readonly modelName = "skill" as const;

	async listAll(): Promise<Skill[]> {
		return this.findMany({ orderBy: { name: "asc" } });
	}
}

export const skillRepository = new SkillRepository();
