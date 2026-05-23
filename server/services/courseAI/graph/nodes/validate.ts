import { DraftStep } from "@/generated/prisma";
import type { CourseBuilderStateT } from "@/server/services/courseAI/graph/state";
import { withNodeErrors } from "@/server/services/courseAI/graph/withNodeErrors";
import { getValidatorForStep } from "@/server/services/courseAI/validators/getValidatorForStep";

export const validate = withNodeErrors("validate", async (state) => {
	const schema = getValidatorForStep(state.currentStep);
	const parsed = schema.safeParse(state.draftStepData);

	if (!parsed.success) {
		return { validationErrors: parsed.error.issues };
	}

	// Cross-field rule (curriculum): check objectives coverage
	if (state.currentStep === DraftStep.curriculum) {
		const objectives = (
			state.content[DraftStep.objectives] as
				| { objectives?: { value: string }[] }
				| undefined
		)?.objectives;
		const sections = (
			parsed.data as { sections: { lessons: { title: string }[] }[] }
		).sections;
		if (objectives && objectives.length > 0) {
			const titles = sections
				.flatMap((s) => s.lessons.map((l) => l.title.toLowerCase()))
				.join(" ");
			const uncovered = objectives
				.map((o) => o.value.toLowerCase())
				.filter((o) => {
					const head = o.split(/\s+/).slice(0, 3).join(" ");
					return head.length > 3 && !titles.includes(head);
				});
			if (uncovered.length > 0) {
				return {
					validationErrors: [
						{
							code: "custom",
							path: ["sections"],
							message: `Objectives appear uncovered by curriculum: ${uncovered.join("; ")}`,
						},
					],
				};
			}
		}
	}

	return { validationErrors: null };
});
