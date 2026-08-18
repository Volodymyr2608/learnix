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

	return { valid: true };
};
