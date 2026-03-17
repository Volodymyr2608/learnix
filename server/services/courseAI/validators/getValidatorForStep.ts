import { DraftStep } from "@/generated/prisma";
import { courseSchema } from "@/server/entities/course";

export const getValidatorForStep = (step: DraftStep) => {
	switch (step) {
		case DraftStep.basic:
			return courseSchema.pick({
				title: true,
				subtitle: true,
				description: true,
				category: true,
				level: true,
				language: true,
				duration: true,
			});
		case DraftStep.objectives:
			return courseSchema.pick({ objectives: true });
		case DraftStep.requirements:
			return courseSchema.pick({ requirements: true });
		case DraftStep.curriculum:
			return courseSchema.pick({ sections: true });
		default:
			throw new Error("Invalid step");
	}
};
