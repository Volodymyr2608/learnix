import { DraftStep } from "@/generated/prisma";
import type { AiFeature } from "@/server/services/_shared/aiGuard/types";
import {
	autoTransitionPrompt,
	clarifyIntentPrompt,
	reviseConfirmPrompt,
} from "@/server/services/courseAI/prompts/chatResponsePrompts";
import {
	assessClarifyPrompt,
	validationFailurePrompt,
} from "@/server/services/courseAI/prompts/clarifyPrompts";
import { buildSystemPrompt } from "@/server/services/courseAI/prompts/systemPrompt";
import { MERGE_SYSTEM_PROMPT } from "@/server/services/learningPathAI/nodes/mergeAndExplain.node";
import { REFLECT_SYSTEM_PROMPT } from "@/server/services/learningPathAI/nodes/reflectAndCheck.node";
import { SYSTEM_PROMPT as LESSON_TUTOR_SYSTEM_PROMPT } from "@/server/services/lessonAI/lessonAI.agent";
import { CONCEPTS_SYSTEM_PROMPT } from "@/server/services/lessonInsightsAI/chains/concepts.chain";
import { GLOSSARY_SYSTEM_PROMPT } from "@/server/services/lessonInsightsAI/chains/glossary.chain";
import { SUMMARY_SYSTEM_PROMPT } from "@/server/services/lessonInsightsAI/chains/summary.chain";
import {
	QUIZ_INITIAL_SYSTEM_PROMPT,
	QUIZ_REGENERATE_SYSTEM_PROMPT,
} from "@/server/services/quizAI/quizAI.agent";

export type PromptVariant = {
	feature: AiFeature;
	/** Which branch this is, for a failure message that names the gap. */
	name: string;
	/** The prompt as the model receives it, assembled from the real builder. */
	assemble: () => string;
};

/**
 * Every assembled prompt that can produce user-visible or persisted text.
 *
 * Imported, never copied: `promptLeakMarkers.contract.test.ts` asserts each
 * marker is a verbatim substring of one of its feature's variants here, so a
 * prompt edit that strands a marker fails CI instead of silently disarming the
 * leak check. It also asserts the converse — a variant no marker covers fails
 * too, which is why the branches are enumerated one by one rather than by
 * feature.
 */
export const STREAMING_PROMPT_VARIANTS: readonly PromptVariant[] = [
	{
		feature: "lessonAI",
		name: "tutor agent",
		assemble: () => LESSON_TUTOR_SYSTEM_PROMPT,
	},
	{
		feature: "courseAI",
		name: "chat_response/normal",
		assemble: () =>
			buildSystemPrompt({
				step: DraftStep.basic,
				currentCourseData: { title: "Sample" },
			}),
	},
	{
		feature: "courseAI",
		name: "chat_response/auto-transition",
		assemble: () =>
			autoTransitionPrompt({
				step: DraftStep.basic,
				courseData: { title: "Sample" },
			}),
	},
	{
		feature: "courseAI",
		name: "chat_response/revise-confirm",
		assemble: reviseConfirmPrompt,
	},
	{
		feature: "courseAI",
		name: "chat_response/clarify-intent",
		assemble: () => clarifyIntentPrompt({ step: DraftStep.basic }),
	},
	{
		feature: "courseAI",
		name: "clarify/assess-clarify",
		assemble: () => assessClarifyPrompt("Shall we move on?"),
	},
	{
		feature: "courseAI",
		name: "clarify/validation-failure",
		assemble: () =>
			validationFailurePrompt({
				step: DraftStep.basic,
				validationErrors: [{ path: ["title"], message: "Required" }],
				draftStepData: { title: "" },
			}),
	},
	{
		feature: "quizAI",
		name: "agent/initial",
		assemble: () => QUIZ_INITIAL_SYSTEM_PROMPT,
	},
	{
		feature: "quizAI",
		name: "agent/regenerate",
		assemble: () => QUIZ_REGENERATE_SYSTEM_PROMPT,
	},
	{
		feature: "lessonInsightsAI",
		name: "chain/summary",
		assemble: () => SUMMARY_SYSTEM_PROMPT,
	},
	{
		feature: "lessonInsightsAI",
		name: "chain/concepts",
		assemble: () => CONCEPTS_SYSTEM_PROMPT,
	},
	{
		feature: "lessonInsightsAI",
		name: "chain/glossary",
		assemble: () => GLOSSARY_SYSTEM_PROMPT,
	},
	{
		feature: "learningPathAI",
		name: "mergeAndExplain",
		assemble: () => MERGE_SYSTEM_PROMPT,
	},
	{
		feature: "learningPathAI",
		name: "reflectAndCheck",
		assemble: () => REFLECT_SYSTEM_PROMPT,
	},
];
