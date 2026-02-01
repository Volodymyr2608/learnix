import {
	type DraftStepType,
	STEPS_MAP,
} from "@/app/_components/Course/components/AIChatBuilderDialog/constants/steps";
import type { CourseGeneration, Prisma } from "@/generated/prisma";
import type {
	CourseGenerationCreateDto,
	CourseGenerationUpdateDto,
} from "@/server/entities/course";
import BaseRepository from "@/server/repositories/baseRepository";
import { logger } from "@/server/utils/logger";

export default class CourseGenerationRepository extends BaseRepository<
	CourseGeneration,
	CourseGenerationCreateDto,
	CourseGenerationUpdateDto
> {
	protected readonly model = "courseGeneration";

	async updateContent(
		id: string,
		step: DraftStepType,
		stepData?: Prisma.JsonObject,
	) {
		try {
			const record = await this.findOne(id);
			const existingContent = (record?.content as Prisma.JsonObject) || {};
			const nextStep = STEPS_MAP[step]?.next;

			const updatedContent: Prisma.JsonObject = {
				...existingContent,
				...(stepData ?? {}),
			};

			return await this.update(id, {
				content: updatedContent,
				step: nextStep ?? "curriculum",
			});
		} catch (error) {
			logger.error(error);
			throw new Error("[Course Generation] Failed to update content]");
		}
	}
}

export const courseGenerationRepository = new CourseGenerationRepository();
