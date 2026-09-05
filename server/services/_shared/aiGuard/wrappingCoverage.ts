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
 *
 * ## What this scan does NOT prove (AC 63)
 *
 * A green run means every interpolation is wrapped or claimed. It does not mean
 * the prompts are safe. Four known false negatives, recorded so the test claims
 * no completeness it lacks:
 *
 *  1. **Cross-file assembly.** A prompt built in file A from a value read in
 *     file B is judged only where the interpolation is written. `buildSystemPrompt`
 *     is a real instance: its own template lives in `courseAI/prompts/`, which is
 *     not a model-calling file and so is not scanned.
 *  2. **The wrong `source` label.** The scan sees that `wrapUntrustedContent` was
 *     called, never whether `"course_data"` was the honest label for the value.
 *  3. **Mixed-trust serialisation.** `JSON.stringify(x)` is judged on `x`'s root
 *     alone, so an object that is server-built but carries one model-authored
 *     field reads as trusted.
 *  4. **A chain with no template.** A binding assembled by a call — `.map(...)`,
 *     `.filter(...)`, `Object.fromEntries(...)` — is skipped rather than followed,
 *     and only its parts are judged where the walker meets them. **Two** such
 *     shapes exist: `revisePriorField.ts`'s `currentStepData`, wrapped by hand,
 *     and `classifyIntent.ts`'s `keys`, entered in ALLOWED_INTERPOLATIONS with
 *     its claim written out. Neither is proved by the scan, which is why both
 *     are named here — a blind spot nobody lists reads as coverage. Adding a
 *     third without a line here is how this note stops being true.
 *  5. **A prompt builder outside the scan set.** A call to a builder named in
 *     TRUSTED_INTERPOLATIONS is trusted at the call site, so the claim holds only
 *     while every such builder is also a registered entry point. Both halves are
 *     asserted by the contract test below.
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
	// The platform's own prompt builders. Every one of them is a REGISTERED entry
	// point, so its body is scanned in its own file and trusting the call site is
	// composition rather than an exemption. That claim was previously written for
	// "both" builders while four existed — and the two unregistered ones were
	// exactly where an unwrapped interpolation was hiding. Adding a builder here
	// without adding its file to GUARDED_ENTRY_POINTS re-opens that hole.
	"autoTransitionPrompt",
	"reviseConfirmPrompt",
	"clarifyIntentPrompt",
	"assessClarifyPrompt",
	"validationFailurePrompt",
	"buildSystemPrompt",
	"extractStepDataPrompt",
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
	{
		file: "server/services/courseAI/graph/nodes/classifyIntent.ts",
		expression: 'keys.join(", ")',
		reason:
			"Object.keys of a step's own Zod shape — a closed vocabulary of ten literals the platform authored. `state.content` decides only WHICH of them appear, never their spelling: content keys are never iterated, only tested for presence with Object.hasOwn. Entered by hand because the scan skips it under false negative 4 (a .filter() chain off a local binding), so this claim is the record, not the scan — and it is the half of that line which state actually influences.",
	},
	{
		file: "server/services/courseAI/graph/nodes/classifyIntent.ts",
		expression: "step",
		reason:
			"A DraftStep enum member iterated straight off Object.values(DraftStep) while building the ALREADY STORED line — it is not read from state at all, so no user or model value can reach it. What it labels are key names taken from the step's own Zod shape, which are equally the platform's own vocabulary; neither side carries content.",
	},
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

	{
		file: "server/services/courseAI/graph/nodes/toolRouter.ts",
		expression: "m.content",
		reason:
			"A conversation turn passed as its own LangChain message with its own role (HumanMessage / AIMessage), not interpolated into an instruction — the same claim as chatResponse and clarify.",
	},
	{
		file: "server/services/courseAI/graph/nodes/toolRouter.ts",
		expression: "state.messages as BaseMessage[]",
		reason:
			"Tool results, each wrapped by the tool that produced it at return time: searchSimilarCourses and fetchInstructorPriorCourses wrap as course_data, validateCurriculumCoherence wraps its judge prose as model_output, and lookupCategoryTaxonomy returns server-authored taxonomy. This is the cross-tenant channel chat_response deliberately does not read (S8).",
	},

	// --- ids, integers and enums
	{
		file: "server/services/courseAI/prompts/chatResponsePrompts.ts",
		expression: "step",
		reason:
			"The DraftStep enum, passed in from the node — see state.currentStep, which is where it comes from.",
	},
	{
		file: "server/services/courseAI/prompts/chatResponsePrompts.ts",
		expression: "step.toUpperCase()",
		reason: "The same DraftStep enum, upper-cased for the section heading.",
	},
	{
		file: "server/services/courseAI/prompts/extractStepDataPrompt.ts",
		expression: "step",
		reason: "The DraftStep enum, passed in from the extraction node.",
	},
	{
		file: "server/services/courseAI/prompts/extractStepDataPrompt.ts",
		expression: "history",
		reason:
			"Already-wrapped text: extractStepData.ts builds this string with wrapUntrustedContent around each message's content before passing it in. Wrapping again here would nest two regions.",
	},
	{
		file: "server/services/courseAI/prompts/systemPrompt.ts",
		expression: "step",
		reason:
			"The DraftStep enum, passed in from the node that builds the prompt.",
	},
	{
		file: "server/services/courseAI/prompts/systemPrompt.ts",
		expression: "step.toUpperCase()",
		reason: "The same DraftStep enum, upper-cased for a heading.",
	},
	{
		file: "server/services/courseAI/prompts/clarifyPrompts.ts",
		expression: "step",
		reason: "The DraftStep enum, passed in from the clarify node.",
	},
	{
		file: "server/services/courseAI/prompts/clarifyPrompts.ts",
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
