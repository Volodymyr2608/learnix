import type { Section } from "@/generated/prisma";
import type {
	SectionCreateDto,
	SectionUpdateDto,
} from "@/server/entities/course";
import BaseRepository from "@/server/repositories/baseRepository";

export default class SectionRepository extends BaseRepository<
	Section,
	SectionCreateDto,
	SectionUpdateDto
> {
	protected readonly model = "section";
}

export const sectionRepository = new SectionRepository();
