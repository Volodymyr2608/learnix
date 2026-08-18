/**
 * The trust lists behind the default-deny wrapping scan
 * (`wrappingCoverage.contract.test.ts`).
 *
 * Default-deny means every value interpolated into a prompt is untrusted until
 * it is either wrapped by `wrapUntrustedContent` or named here with a reason.
 * Two entries would switch the scan off wholesale and must never be added:
 *
 *   - `wrapUntrustedContent` — the wrapper itself; trusting it makes every call
 *     site vacuously fine.
 *   - `JSON` — serialisation is the dominant idiom in these files, so trusting
 *     the callee waves through every value nested in a `JSON.stringify(...)`.
 */

/**
 * Identifiers that are server-authored wherever they appear: constant prompt
 * text this repository owns. A name here is trusted in every model-calling file,
 * so it must be a constant, never a variable that happens to share the name.
 */
export const TRUSTED_INTERPOLATIONS: string[] = [
	// server/services/_shared/aiGuard/messages.ts
	"UNTRUSTED_DATA_CLAUSE",
	"NEUTRAL_REFUSAL_MESSAGE",
	// server/services/courseAI/prompts/*
	"STEP_PROMPTS",
	"SYSTEM_PROMPT",
	"STEP_MESSAGES",
];

/**
 * Expressions trusted wherever they appear, each with the claim that makes it
 * trusted. Written as expressions rather than root identifiers because `state`
 * as a whole is untrusted — only these specific reads off it are not.
 */
export const TRUSTED_EXPRESSIONS: Array<{
	expression: string;
	reason: string;
}> = [
	{
		expression: "state.userMessage",
		reason:
			"The instructor's own turn, and the one value that already has a guard: guardUserInput (L1+L2) runs at app/api/chat/course/route.ts before the graph is entered. Wrapping it as well would tell the model to discount the message it is supposed to answer.",
	},
	{
		expression: "state.currentStep",
		reason:
			"A DraftStep enum the server sets on CourseGeneration; the model can request a revise target but never writes this field's value.",
	},
	{
		expression: "state.currentStep.toUpperCase()",
		reason: "See state.currentStep — the same enum, upper-cased.",
	},
	{
		expression: "m.role",
		reason:
			'A fixed "user" | "assistant" union on CourseGenerationMessage, not free text.',
	},
	{
		expression: "m.step",
		reason: "The DraftStep enum column on CourseGenerationMessage.",
	},
];

export type AllowedInterpolation = {
	/** Repository-relative path of the model-calling file. */
	file: string;
	/** Verbatim source text of the interpolated expression. */
	expression: string;
	/** Why this specific expression cannot carry text the platform did not author. */
	reason: string;
};

/**
 * Per-expression exemptions. Scoped to one file and one exact expression on
 * purpose: an exemption is a claim about a specific value, and a claim that
 * cannot be written down as a sentence here is not a claim worth honouring.
 */
export const ALLOWED_INTERPOLATIONS: AllowedInterpolation[] = [
	// --- values folded into a history line that is wrapped where it is rendered
	{
		file: "server/services/courseAI/graph/nodes/assessCompletion.ts",
		expression: "state.userMessage",
		reason:
			"Folded into the historyText array and wrapped at the `.map` that renders it; wrapping here as well would nest two regions.",
	},
	{
		file: "server/services/courseAI/graph/nodes/assessCompletion.ts",
		expression: "state.assistantText",
		reason: "Same array as above — wrapped at the `.map` that renders it.",
	},
	{
		file: "server/services/courseAI/graph/nodes/extractStepData.ts",
		expression: "state.assistantText",
		reason:
			"Folded into historyForPrompt and wrapped at the `.map` that renders it.",
	},
	{
		file: "server/services/courseAI/graph/nodes/extractStepData.ts",
		expression: "state.userMessage",
		reason:
			"Folded into historyForPrompt and wrapped at the `.map` that renders it.",
	},

	// --- conversation turns passed as their own chat message
	{
		file: "server/services/courseAI/graph/nodes/chatResponse.ts",
		expression: "m.content",
		reason:
			"Passed as its own chat message carrying its own role, not interpolated into an instruction. The role boundary is the isolation here; what Task 12 narrows is which turns are eligible at all.",
	},
	{
		file: "server/services/courseAI/graph/nodes/clarify.ts",
		expression: "m.content",
		reason: "See chatResponse — a chat message with its own role.",
	},

	// --- ids, integers and enums
	{
		file: "server/services/courseAI/graph/nodes/clarify.ts",
		expression: "i",
		reason: "A loop index the server derives while numbering the error list.",
	},
	{
		file: "server/services/courseAI/graph/nodes/revisePriorField.ts",
		expression: "state.reviseTarget",
		reason:
			"classifyIntent's structured output constrains reviseTarget to the DraftStep enum (classifyIntent.ts:9-11), so the model chooses among steps but does not author the value.",
	},
	{
		file: "server/services/learningPathAI/nodes/mergeAndExplain.node.ts",
		expression: "JSON.stringify(state.completedLessonIds)",
		reason:
			"Lesson cuids read from CourseProgress; no instructor- or model-authored text.",
	},
	{
		file: "server/services/learningPathAI/nodes/mergeAndExplain.node.ts",
		expression: "JSON.stringify(state.failedQuizzes)",
		reason: "Quiz and lesson cuids read from QuizAttempt.",
	},
	{
		file: "server/services/learningPathAI/nodes/reflectAndCheck.node.ts",
		expression: "state.completedLessonIds.length",
		reason:
			"An array length — an integer counted from lesson cuids, carrying no text.",
	},
	{
		file: "server/services/quizAI/quizAI.agent.ts",
		expression: "count",
		reason:
			"The number of questions to generate, a validated number from the DTO. `level`, the free-text field beside it, is wrapped.",
	},

	// --- template literals that never reach a model
	{
		file: "server/services/courseAI/tools/searchSimilarCourses.ts",
		expression: "String(err)",
		reason:
			"A logger.error message, not model input: the tool returns a fixed `{ error }` string to the agent.",
	},
	{
		file: "server/services/courseAI/tools/fetchInstructorPriorCourses.ts",
		expression: "String(err)",
		reason: "A logger.error message; the agent receives a fixed string.",
	},
	{
		file: "server/services/courseAI/tools/validateCurriculumCoherence.ts",
		expression: "String(err)",
		reason: "A logger.error message; the agent receives a fixed string.",
	},
];
