import type { DraftStep } from "@/generated/prisma";
import { wrapUntrustedContent } from "@/server/services/_shared/aiGuard/wrapUntrusted";

/**
 * The `clarify` node's two prompt branches. Both stream to the instructor, so
 * both are prompt variants that need marker coverage of their own.
 *
 * The interpolated values are another model's output — the question
 * assess_completion wrote, zod's report on model-extracted data, and that data
 * itself — so each is wrapped even though it never left the platform.
 */

const FALLBACK_QUESTION =
	"Everything looks good — shall I finalize this step and move on?";

/** assess_completion routed here because the instructor's intent was ambiguous. */
export const assessClarifyPrompt = (question: string | null): string =>
	`Ask the user the following question, in a friendly and concise way. Respond in the SAME LANGUAGE as the user's most recent message above. Output a single question only — do NOT add translations or repeat it in another language: "${
		question
			? wrapUntrustedContent(question, "model_output")
			: FALLBACK_QUESTION
	}"`;

/** The validate node rejected the extracted data — ask about the worst field. */
export const validationFailurePrompt = ({
	step,
	validationErrors,
	draftStepData,
}: {
	step: DraftStep;
	validationErrors: readonly unknown[];
	draftStepData: unknown;
}): string => {
	const issues = validationErrors
		.map(
			(issue, i) =>
				`${i + 1}. ${wrapUntrustedContent(JSON.stringify(issue), "model_output")}`,
		)
		.join("\n");

	return `You just tried to finalize the "${step}" step but validation failed. Ask the user ONE concise, friendly follow-up question about the most important missing field. Respond in the SAME LANGUAGE as the user's most recent message above. Output a single question only — do NOT add translations. Do not list every error. Do not show JSON.

		VALIDATION ERRORS:
		${issues}

		EXTRACTED (FAILING) DATA:
		${wrapUntrustedContent(JSON.stringify(draftStepData, null, 2), "model_output")}`;
};
