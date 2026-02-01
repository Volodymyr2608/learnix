import {
	type DraftStepType,
	STEPS_MAP,
} from "@/app/_components/Course/components/AIChatBuilderDialog/constants/steps";
import type { CourseGeneration } from "@/generated/prisma";
import type {
	CourseGenerationCreateDto,
	CourseGenerationUpdateDto,
} from "@/server/entities/course";
import BaseRepository from "@/server/repositories/baseRepository";

export default class CourseGenerationRepository extends BaseRepository<
	CourseGeneration,
	CourseGenerationCreateDto,
	CourseGenerationUpdateDto
> {
	protected readonly model = "courseGeneration";

	async updateContent(id: string, step: DraftStepType, stepData: any) {
		const record = await this.findOne(id);
		const existingContent = (record?.content as Record<string, any>) || {};
		const nextStep = STEPS_MAP[step]?.next;

		if (!nextStep) return;

		return await this.update(id, {
			content: {
				...existingContent,
				...stepData,
			},
			step: nextStep,
		});
	}
}

export const courseGenerationRepository = new CourseGenerationRepository();
