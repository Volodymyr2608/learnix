import { NEUTRAL_REFUSAL_MESSAGE } from "@/server/services/_shared/aiGuard/messages";
import { logSecurityEvent } from "@/server/services/_shared/aiGuard/securityLog";
import type { SecurityOutcome } from "@/server/services/_shared/aiGuard/types";
import { resolveAllowlistedConcept } from "@/server/services/_shared/concepts/conceptKey";
import { CONVERSATION_MAX_LEVEL } from "@/server/services/mastery/masteryLevels";
import type {
	ConceptCheckPolicyContext,
	ConceptCheckRequest,
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
	"ask_concept_check",
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
 * budget spent, or a check the model simply wrote badly. The event is routine
 * and unforwarded, and the message is explanatory rather than neutral: the
 * tutor has to be able to say something coherent to the student, and there is
 * no secret in "this lesson has no concepts recorded yet".
 *
 * The dividing line against `deny` is whether the call is evidence of an
 * ATTACK, not whether it failed. `unsafe_tool_call` is the taxonomy's only
 * zero-baseline outcome and the only one securityLog forwards: its value is
 * that a single occurrence means something. Structural mistakes — a stem too
 * short, two options that fold together, a key rendered differently from the
 * option it names — are what a cooperative model produces on an authoring task
 * nothing has measured it on, and filing them under the alert would retire the
 * alert. Authority and rendered markup stay on `deny`.
 *
 * Grounding did too, until item 16. A model that has already retrieved earlier
 * in the conversation stops retrieving, so `check_not_grounded` fired on
 * cooperative use and gave the zero-baseline outcome a baseline — the very
 * thing this split exists to prevent. It is a decline now.
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
 * The one thing said back to the model about a check it wrote badly.
 *
 * Shared by every well-formedness rule on purpose. A message that named the
 * rule would let a model — or a student steering one — binary-search the
 * validator by authoring checks until the wording changed, which is a map of
 * the policy handed out one refusal at a time.
 */
const MALFORMED_CHECK_MESSAGE =
	"That question was not usable. Try a different one.";

/**
 * The one refusal in this file the model is meant to ACT on rather than merely
 * absorb, so it names what is missing instead of sharing the text above.
 *
 * It discloses nothing: `ask_concept_check`'s own description already ends
 * "Requires having called retrieve_lesson_context on this turn." The shared
 * malformed-check message exists so a validator cannot be binary-searched by
 * authoring checks until the wording changes; grounding was never part of that
 * search space, and a model that cannot tell "you must read the lesson first"
 * from "your question was malformed" simply stops asking.
 */
const UNGROUNDED_CHECK_MESSAGE =
	"Call retrieve_lesson_context for this lesson first, then ask the check.";

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

	// This was written as the rule that answers "ask me a check whose correct
	// answer is 'banana'". It is not, and never was: security.md S13 §35
	// established that the retrieval which DELIVERS an injected payload is the
	// retrieval that grounds the check, so the rule cannot fire on the attack it
	// was named for. What it still buys is that the model authored from the
	// lesson rather than from parametric memory — worth keeping, worth nothing to
	// an attacker, and therefore a decline rather than an alert (item 16).
	if (!ctx.groundedByRetrieval)
		return decline(ctx, "check_not_grounded", UNGROUNDED_CHECK_MESSAGE);

	const question = request.question.trim();
	if (
		question.length < CHECK_QUESTION_MIN_LENGTH ||
		question.length > CHECK_QUESTION_MAX_LENGTH
	) {
		return decline(ctx, "question_length", MALFORMED_CHECK_MESSAGE);
	}

	if (
		request.options.length < CHECK_MIN_OPTIONS ||
		request.options.length > CHECK_MAX_OPTIONS
	) {
		return decline(ctx, "option_count", MALFORMED_CHECK_MESSAGE);
	}

	if (
		request.options.some(
			(option) =>
				option.trim().length === 0 || option.length > CHECK_OPTION_MAX_LENGTH,
		)
	) {
		return decline(ctx, "option_length", MALFORMED_CHECK_MESSAGE);
	}

	if (request.options.some((option) => CARRIES_MARKUP.test(option))) {
		return deny(ctx, "option_markup");
	}

	const folded = request.options.map(foldOption);
	if (new Set(folded).size !== folded.length) {
		return decline(ctx, "options_not_distinct", MALFORMED_CHECK_MESSAGE);
	}

	const correct = foldOption(request.correctOption);
	const correctIndex = folded.indexOf(correct);
	if (correctIndex < 0) {
		return decline(ctx, "correct_option_not_offered", MALFORMED_CHECK_MESSAGE);
	}

	// A stem that contains its own answer grades the student's reading, not their
	// understanding, and is the cheapest way for a model under pressure to
	// "help".
	if (correct.length > 0 && foldOption(question).includes(correct)) {
		return decline(ctx, "question_reveals_answer", MALFORMED_CHECK_MESSAGE);
	}

	return {
		authorized: true,
		canonicalConcept: resolved.concept,
		// The OPTION's spelling, never the model's rendering of it — the same rule
		// as the concept, and for the same reason. Grading compares bytes against
		// a stored option, so an answer that differs from its option by a trailing
		// period is an answer no student can select.
		canonicalCorrectOption: request.options[correctIndex] as string,
	};
};
