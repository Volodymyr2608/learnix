import { logSecurityEvent } from "@/server/services/_shared/aiGuard/securityLog";
import { logger } from "@/server/utils/logger";
import {
	containsOffOriginLink,
	containsSystemPromptLeak,
	containsUntrustedDataEcho,
} from "./checks";
import type {
	AiOutputRuleId,
	ModelTextContext,
	ModelTextResult,
} from "./types";

const reject = (
	ctx: ModelTextContext,
	ruleId: AiOutputRuleId,
): ModelTextResult => {
	// One event per rejected text. `emit: false` belongs to a caller that
	// enforces here and reports somewhere else — never to a caller that wants
	// the rejection quietly.
	if (ctx.emit !== false) {
		logSecurityEvent({
			feature: ctx.feature,
			userId: ctx.userId,
			layer: "output_validation",
			outcome: "output_validation_failed",
			ruleIds: [ruleId],
			score: 0,
			...(ctx.subject ? { subject: ctx.subject } : {}),
		});
	}
	return { valid: false, ruleId };
};

/**
 * The shared output boundary: the checks that hold for any model-authored text,
 * on any surface.
 *
 * Fail-closed in both directions. A check that matches rejects; a check that
 * throws also rejects, because a boundary that fails open on its own bug is not
 * a boundary. The conversion lives here so no caller has to remember it, and no
 * caller can receive an exception from a validator (AC 4).
 *
 * Precedence is deliberate and asserted: a reply that trips several rules is
 * reported as the most specific leak it commits, not the last one checked.
 */
export const validateModelText = (
	text: string,
	ctx: ModelTextContext,
): ModelTextResult => {
	try {
		if (containsSystemPromptLeak(text, ctx.feature))
			return reject(ctx, "system_prompt_echo");
		if (containsUntrustedDataEcho(text))
			return reject(ctx, "untrusted_data_echo");
		if (containsOffOriginLink(text)) return reject(ctx, "off_origin_link");
		return { valid: true };
	} catch (error) {
		logger.error(
			{ err: error, feature: ctx.feature },
			"[aiOutput] check threw",
		);
		return reject(ctx, "validator_error");
	}
};
