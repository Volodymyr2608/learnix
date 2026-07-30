import { withNodeErrors } from "@/server/services/courseAI/graph/withNodeErrors";
import { getValidatorForStep } from "@/server/services/courseAI/validators/getValidatorForStep";

/**
 * Purpose: full Zod validation of draftStepData against the step's real constraints.
 * Reads: currentStep, draftStepData.
 * Writes: validationErrors — null on success, the Zod issues on failure.
 * Fails: does not throw on invalid data; routeAfterValidate sends "fail" to clarify, so a failed
 * validation is a conversation turn, not an error.
 */
export const validate = withNodeErrors("validate", async (state) => {
	const schema = getValidatorForStep(state.currentStep);
	const parsed = schema.safeParse(state.draftStepData);

	if (!parsed.success) {
		return { validationErrors: parsed.error.issues };
	}

	return { validationErrors: null };
});
