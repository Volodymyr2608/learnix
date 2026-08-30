import { logSecurityEvent } from "@/server/services/_shared/aiGuard/securityLog";
import { validateModelText } from "@/server/services/_shared/aiOutput";
import type {
	ReplyValidationContext,
	ReplyValidationResult,
	ReplyValidationRuleId,
} from "./types";

/**
 * A run this long reproduced word for word is a dump, not a quotation.
 *
 * Detection is guaranteed only for runs of `VERBATIM_RUN + VERBATIM_STEP - 1`
 * characters (87): a shorter run can fall between two window starts. Anything
 * under `VERBATIM_RUN` is never checked at all. Exact substring matching also
 * means reformatting (re-wrapping, bulletising) defeats the check — this is a
 * dump detector, not a paraphrase detector.
 */
const VERBATIM_RUN = 80;
const VERBATIM_STEP = 8;

const stripWrapperTags = (value: string): string =>
	value.replace(/<\/?untrusted_data[^>]*>/g, "");

/**
 * The one check that is not surface-independent: it needs this turn's retrieved
 * chunks, which only the tutor has. The other three live in `_shared/aiOutput`.
 */
const containsVerbatimChunk = (
	reply: string,
	retrievedContent: string[],
): boolean =>
	retrievedContent.some((raw) => {
		const content = stripWrapperTags(raw);
		for (
			let start = 0;
			start + VERBATIM_RUN <= content.length;
			start += VERBATIM_STEP
		) {
			if (reply.includes(content.slice(start, start + VERBATIM_RUN)))
				return true;
		}
		return false;
	});

/**
 * Whitespace-insensitive, case-insensitive containment. The model writes the
 * reply and the option in the same breath, so an echo that differs only in
 * spacing or capitalisation is the same giveaway.
 */
const fold = (value: string): string =>
	value.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Below this, containment is coincidence rather than a giveaway.
 *
 * The rule fails in the direction that removes the feature: it discards the
 * check silently, and the only trace is a routine unforwarded event nothing
 * consumes. So a correct option like "NULL", "true", "4" or "once" — each of
 * which appears in almost any honest reply about the lesson that taught it —
 * would make every check on that concept vanish, with no signal at all.
 *
 * Eight characters keeps real answers in scope ("route.ts" is eight) while
 * dropping the bare keywords. The residual is the mirror image: a reply that
 * names a very short answer still leaves a gradable check. That is the cheaper
 * failure — a lucky guess buys a label, an undetectable outage buys nothing —
 * and it is stated in security.md S13.
 */
const MIN_ECHO_NEEDLE_LENGTH = 8;

const revealsCheckAnswer = (
	reply: string,
	correctOption?: string | null,
): boolean => {
	if (!correctOption) return false;
	const needle = fold(correctOption);
	if (needle.length < MIN_ECHO_NEEDLE_LENGTH) return false;
	return fold(reply).includes(needle);
};

const reject = (
	ctx: ReplyValidationContext,
	ruleId: ReplyValidationRuleId,
): ReplyValidationResult => {
	logSecurityEvent({
		feature: "lessonAI",
		userId: ctx.userId,
		layer: "output_validation",
		outcome: "output_validation_failed",
		ruleIds: [ruleId],
		score: 0,
	});
	return { valid: false, ruleId };
};

/**
 * Fail-closed check over the assembled reply, composed over the shared boundary
 * plus the tutor's own verbatim-dump rule.
 *
 * The shared call runs with `emit: false` and this function is the single
 * emitter, so a rejected reply still produces exactly one security event rather
 * than one per layer (AC 8). Precedence is preserved verbatim from before the
 * extraction: system_prompt_echo → untrusted_data_echo → verbatim_chunk_echo →
 * off_origin_link, which is why the shared result is consulted in two parts
 * rather than returned wholesale.
 *
 * Deliberately does NOT catch its own exceptions: lessonAI.service.ts treats a
 * throw exactly like a returned rejection, per spec.
 */
export const validateReply = (
	reply: string,
	ctx: ReplyValidationContext,
): ReplyValidationResult => {
	const shared = validateModelText(reply, {
		feature: "lessonAI",
		userId: ctx.userId,
		emit: false,
	});

	if (
		!shared.valid &&
		(shared.ruleId === "system_prompt_echo" ||
			shared.ruleId === "untrusted_data_echo" ||
			shared.ruleId === "validator_error")
	) {
		return reject(ctx, shared.ruleId);
	}

	if (containsVerbatimChunk(reply, ctx.retrievedContent)) {
		return reject(ctx, "verbatim_chunk_echo");
	}

	if (!shared.valid) return reject(ctx, shared.ruleId);

	if (revealsCheckAnswer(reply, ctx.pendingCheckAnswer)) {
		// Routine, not adversarial, and NOT a rejection. The correct option is by
		// construction a phrase from the lesson the tutor has just been explaining,
		// so this rule has a structurally high false-positive rate — unlike
		// system_prompt_echo, whose markers never occur in legitimate prose.
		// Failing closed on the CHECK costs the student one question they can be
		// asked again; failing closed on the REPLY would destroy a legitimate turn
		// on a collision. The event is routine and unforwarded for the same reason.
		logSecurityEvent({
			feature: "lessonAI",
			userId: ctx.userId,
			layer: "output_validation",
			outcome: "tool_call_declined",
			ruleIds: ["concept_check_answer_echo"],
			score: 0,
		});
		return { valid: true, suppressCheck: true };
	}

	return { valid: true };
};
