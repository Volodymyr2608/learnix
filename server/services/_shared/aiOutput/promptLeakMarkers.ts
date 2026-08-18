import type { AiFeature } from "@/server/services/_shared/aiGuard/types";

/**
 * Distinctive phrases from the STATIC portion of each surface's prompts. If
 * model output contains one, the model is reciting its instructions.
 *
 * TOTAL by type. A `Partial<Record<…>>` with a `?? []` fallback is the G2 defect
 * one level down — surface number six would get silent zero coverage while the
 * conformance matrix still read `applied`. A new AiFeature must fail to compile
 * here, not fall through to an empty set.
 *
 * Never draw a phrase from wrapped untrusted content: that is instructor text
 * and may legitimately appear in an answer. `"Do NOT show raw JSON"` was
 * rejected as a marker — four generic words, matched case-insensitively, and a
 * builder reply saying "I won't show raw JSON here" is a plausible false
 * positive.
 *
 * Coverage is per prompt VARIANT, not per feature: chat_response has four
 * branches and the clarify node two more, and markers covering only the normal
 * branch would reproduce inside courseAI the per-surface gap this feature
 * exists to close. A marker that stops being a verbatim substring of one of its
 * feature's variants fails CI, as does a variant no marker covers.
 */
export const LEAK_MARKERS: Record<AiFeature, readonly string[]> = {
	lessonAI: [
		"Tool usage rules (follow in order):",
		"You are an AI tutor for one lesson of one course",
		"Never paste retrieved lesson content back verbatim",
	],
	courseAI: [
		// chat_response/normal
		"IGNORE all previous chat history regarding other steps",
		// chat_response/auto-transition
		"You are a professional educational consultant helping a teacher build a course",
		// chat_response/revise-confirm
		"confirming the change was applied and briefly describing what was updated",
		// chat_response/clarify-intent
		"it could mean they want to continue with the current",
		// clarify/assess-clarify
		"Ask the user the following question, in a friendly and concise way",
		// clarify/validation-failure
		"Ask the user ONE concise, friendly follow-up question about the most important missing field",
	],
	quizAI: [
		"You are an expert quiz writer for an online learning platform",
		'The "correct" field must be verbatim identical to one of the 4 options',
	],
	lessonInsightsAI: [
		"write a single concise paragraph (60–150 words) that captures the lesson's purpose",
		"identify the 3–7 most important concepts the student must understand",
		"extract domain-specific terms and jargon that a beginner might not know",
	],
	learningPathAI: [
		"produce 3–5 final steps with concrete one-sentence reasons grounded in the student's progress",
		"Return ok=false with concise feedback if: there are too many review steps",
	],
};

export const leakMarkersFor = (feature: AiFeature): readonly string[] =>
	LEAK_MARKERS[feature];
