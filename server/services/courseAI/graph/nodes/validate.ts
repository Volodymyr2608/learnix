import { withNodeErrors } from "@/server/services/courseAI/graph/withNodeErrors";
import { getValidatorForStep } from "@/server/services/courseAI/validators/getValidatorForStep";

export const validate = withNodeErrors("validate", async (state) => {
	const schema = getValidatorForStep(state.currentStep);
	const parsed = schema.safeParse(state.draftStepData);

	if (!parsed.success) {
		return { validationErrors: parsed.error.issues };
	}

	return { validationErrors: null };
});
