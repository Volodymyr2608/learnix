import type { Prisma, Section } from "@/generated/prisma";
import { BaseRepository } from "@/server/repositories/base/base.repository";

export default class SectionRepository extends BaseRepository<
	"section",
	Section,
	Prisma.SectionUncheckedCreateInput,
	Prisma.SectionUpdateInput,
	Prisma.SectionWhereInput,
	Prisma.SectionInclude,
	Prisma.SectionSelect,
	Prisma.SectionOrderByWithRelationInput
> {
	protected readonly modelName = "section";
}

export const sectionRepository = new SectionRepository();
