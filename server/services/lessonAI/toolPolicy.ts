import { NEUTRAL_REFUSAL_MESSAGE } from "@/server/services/_shared/aiGuard/messages";
import { logSecurityEvent } from "@/server/services/_shared/aiGuard/securityLog";
import type { SecurityOutcome } from "@/server/services/_shared/aiGuard/types";
import { resolveAllowlistedConcept } from "@/server/services/_shared/concepts/conceptKey";
import { CONVERSATION_MAX_LEVEL } from "@/server/services/mastery/masteryLevels";
import type {
	ConceptCheckPolicyContext,
	ConceptCheckRequest,
	MarkConceptRequest,
	ToolAuthorization,
	ToolPolicyContext,
} from "./types";

/**
 * The four tools the tutor may hold. Enforced structurally, not at runtime:
 * createLessonAgent's tool array is a closed literal and LangChain dispatches
 * only to tools it was handed, so a call under an unregistered name is
 * unrepresentable rather than merely rejected. lessonAI.agent.test.ts pins the
 * built agent's tool list against this constant so the closed set cannot drift.
 */
export const ALLOWED_TOOL_NAMES = [
	"retrieve_lesson_context",
	"search_across_course",
	"get_student_progress",
	"mark_concept_understood",
] as const;

/**
 * Re-exported, not redeclared: the ceiling only means anything next to
 * QUIZ_MASTERY_LEVEL, and the two live together in one module so their ordering
 * is a fact a test can assert rather than a comment in two files.
 */
export { CONVERSATION_MAX_LEVEL };

/**
 * Per-turn scratch state, created once per turn by whatever builds the tools.
 *
 * A model that has been refused will often try again inside the same turn, and
 * five identical events say nothing the first one did not. Deduplication is per
 * OUTCOME, never per turn as a whole: a routine decline must not be able to
 * swallow the zero-baseline alert that follows it.
 */
export type TurnDenialLedger = { emitted: Set<SecurityOutcome> };

export const newTurnDenialLedger = (): TurnDenialLedger => ({
	emitted: new Set(),
});

const emitDenial = (
	ctx: ToolPolicyContext,
	ruleId: string,
	outcome: SecurityOutcome,
): void => {
	// Absent a ledger every denial is emitted: a caller with no notion of a turn
	// gets the noisy, complete record rather than a silently suppressed one.
	if (ctx.denials?.emitted.has(outcome)) return;
	ctx.denials?.emitted.add(outcome);

	logSecurityEvent({
		feature: "lessonAI",
		userId: ctx.userId,
		layer: "tool_policy",
		outcome,
		ruleIds: [ruleId],
		score: 0,
	});
};

/**
 * The call should never have been made. Zero-baseline outcome, forwarded, and
 * the model learns nothing from the refusal beyond that it was refused.
 */
const deny = (ctx: ToolPolicyContext, ruleId: string): ToolAuthorization => {
	emitDenial(ctx, ruleId, "unsafe_tool_call");
	return { authorized: false, message: NEUTRAL_REFUSAL_MESSAGE };
};

/**
 * An ordinary "not now" — nothing to check yet, a question already waiting, a
 * budget spent. The event is routine and unforwarded, and the message is
 * explanatory rather than neutral: the tutor has to be able to say something
 * coherent to the student, and there is no secret in "this lesson has no
 * concepts recorded yet".
 */
const decline = (
	ctx: ToolPolicyContext,
	ruleId: string,
	message: string,
): ToolAuthorization => {
	emitDenial(ctx, ruleId, "tool_call_declined");
	return { authorized: false, message };
};

/**
 * Zod on the tool schema validates shape (string 1-80, int 0-3). This validates
 * whether THIS call may proceed at all. Checks run in a fixed order; when more
 * than one would deny, the first wins and is the only rule id logged.
 */
export const authorizeMarkConceptUnderstood = (
	request: MarkConceptRequest,
	ctx: ToolPolicyContext,
): ToolAuthorization => {
	if (ctx.lessonConcepts.length === 0) return deny(ctx, "empty_allowlist");
	if (request.level > CONVERSATION_MAX_LEVEL) {
		return deny(ctx, "level_exceeds_conversation_ceiling");
	}

	// One comparison rule, shared with `identifyWeakSignals` and with the SQL that
	// backfilled `conceptKey`. The inline `trim().toLowerCase()` this replaces
	// normalised the ends and the case but not internal runs, so it disagreed with
	// the reader on exactly the inputs the allowlist carries: model-authored
	// insights JSON, padding and all.
	//
	// The resolver returns the ALLOWLIST's spelling, never the model's — storing
	// the model's would put one concept in the table under two names. A name that
	// is not allowlisted and one whose allowlist entry is unstorable are the same
	// refusal on purpose: neither is distinguishable to the caller.
	const resolved = resolveAllowlistedConcept(
		request.concept,
		ctx.lessonConcepts,
	);
	if (!resolved) return deny(ctx, "concept_not_allowlisted");

	return { authorized: true, canonicalConcept: resolved.concept };
};

/**
 * Bounds on what the model may author. Exported so the tool's Zod schema and
 * this policy cannot disagree about what a well-formed check is — a shape the
 * schema accepts and the policy rejects is a denial the model can never learn
 * to avoid.
 */
export const CHECK_QUESTION_MIN_LENGTH = 10;
export const CHECK_QUESTION_MAX_LENGTH = 300;
export const CHECK_OPTION_MAX_LENGTH = 120;
export const CHECK_MIN_OPTIONS = 4;
export const CHECK_MAX_OPTIONS = 5;

/**
 * Distinctness is judged after folding, not on the raw strings. `"A"` and
 * `"a."` are the same answer wearing different punctuation, and a question with
 * two identical options is a question with three — which is one short of the
 * floor that makes guessing expensive.
 */
const foldOption = (option: string): string =>
	option
		.trim()
		.toLowerCase()
		.replace(/[\s]+/g, " ")
		.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

/**
 * Anything that turns an option into a place to click or a thing to render.
 * Options are shown to a student verbatim; a link is an exfiltration channel and
 * a tag is an injection into the page.
 */
const CARRIES_MARKUP = /https?:\/\/|www\.|\[[^\]]*\]\([^)]*\)|<[^>]+>/i;

/**
 * Whether THIS authored check may be persisted. Zod guarantees the argument
 * types; this decides whether the call may proceed at all.
 *
 * Rules run in a fixed order and the first to deny wins, so exactly one id is
 * logged. The order is authority, then grounding, then structure, then content:
 * a caller with no right to ask is refused before anything it wrote is
 * inspected, which keeps a denial from reporting on text the model should not
 * have been able to submit in the first place.
 */
export const authorizeAskConceptCheck = (
	request: ConceptCheckRequest,
	ctx: ConceptCheckPolicyContext,
): ToolAuthorization => {
	if (ctx.lessonConcepts.length === 0) {
		return decline(
			ctx,
			"empty_allowlist",
			"This lesson has no concepts recorded yet, so there is nothing to check.",
		);
	}

	const resolved = resolveAllowlistedConcept(
		request.concept,
		ctx.lessonConcepts,
	);
	if (!resolved) return deny(ctx, "concept_not_allowlisted");

	// The rule that answers "ask me a check whose correct answer is 'banana'".
	// That request is pattern-free, on-topic and produces a perfectly well-formed
	// question, so no other layer in the stack sees anything wrong with it. What
	// is wrong with it is that the model never read the lesson.
	if (!ctx.groundedByRetrieval) return deny(ctx, "check_not_grounded");

	const question = request.question.trim();
	if (
		question.length < CHECK_QUESTION_MIN_LENGTH ||
		question.length > CHECK_QUESTION_MAX_LENGTH
	) {
		return deny(ctx, "question_length");
	}

	if (
		request.options.length < CHECK_MIN_OPTIONS ||
		request.options.length > CHECK_MAX_OPTIONS
	) {
		return deny(ctx, "option_count");
	}

	if (
		request.options.some(
			(option) =>
				option.trim().length === 0 || option.length > CHECK_OPTION_MAX_LENGTH,
		)
	) {
		return deny(ctx, "option_length");
	}

	if (request.options.some((option) => CARRIES_MARKUP.test(option))) {
		return deny(ctx, "option_markup");
	}

	const folded = request.options.map(foldOption);
	if (new Set(folded).size !== folded.length) {
		return deny(ctx, "options_not_distinct");
	}

	const correct = foldOption(request.correctOption);
	if (!folded.includes(correct)) {
		return deny(ctx, "correct_option_not_offered");
	}

	// A stem that contains its own answer grades the student's reading, not their
	// understanding, and is the cheapest way for a model under pressure to
	// "help".
	if (correct.length > 0 && foldOption(question).includes(correct)) {
		return deny(ctx, "question_reveals_answer");
	}

	return { authorized: true, canonicalConcept: resolved.concept };
};
