import { logger } from "@/server/utils/logger";
import { detectInjection } from "./detectInjection";
import { NEUTRAL_REFUSAL_MESSAGE, offTopicMessage } from "./messages";
import { logSecurityEvent } from "./securityLog";
import { checkTopicRelevance } from "./topicRelevance";
import type { GuardContext, GuardResult } from "./types";

const ALLOWED: GuardResult = {
	outcome: "allow",
	layer: null,
	matchedRuleIds: [],
	score: 0,
	message: null,
};

/**
 * The trust boundary for free-text chat surfaces: runs L1, then L2 only if L1
 * did not block.
 *
 * Returns rather than throws — the two callers are SSE Route Handlers that need
 * to emit an event, not raise. tRPC callers wrap the result in
 * AiGuardBlockedError themselves.
 *
 * Never logs the payload text: only the verdict, layer, and matched rule ids.
 */
export const guardUserInput = async (
	text: string,
	context: GuardContext,
): Promise<GuardResult> => {
	const l1 = detectInjection(text);

	if (l1.verdict === "block") {
		logSecurityEvent({
			feature: context.feature,
			userId: context.userId,
			layer: "L1",
			outcome: "guard_blocked",
			ruleIds: l1.matchedRuleIds,
			score: l1.score,
			obfuscations: l1.obfuscations,
		});
		return {
			outcome: "blocked",
			layer: "L1",
			matchedRuleIds: l1.matchedRuleIds,
			score: l1.score,
			message: NEUTRAL_REFUSAL_MESSAGE,
		};
	}

	if (l1.verdict === "suspect") {
		// Escalates rather than blocks (see patterns/), but must stay visible:
		// this is the signal for tuning BLOCK_THRESHOLD and the pattern weights,
		// and a rising rate is the early sign of someone probing for a bypass.
		logSecurityEvent({
			feature: context.feature,
			userId: context.userId,
			layer: "L1",
			outcome: "guard_suspect",
			ruleIds: l1.matchedRuleIds,
			score: l1.score,
			obfuscations: l1.obfuscations,
		});
	}

	try {
		const relevance = await checkTopicRelevance(
			text,
			context.domain,
			context.metrics,
		);
		if (!relevance.onTopic) {
			logSecurityEvent({
				feature: context.feature,
				userId: context.userId,
				layer: "L2",
				outcome: "guard_off_topic",
				ruleIds: l1.matchedRuleIds,
				score: l1.score,
			});
			return {
				outcome: "off_topic",
				layer: "L2",
				matchedRuleIds: l1.matchedRuleIds,
				score: l1.score,
				message: offTopicMessage(context.domain.subject),
			};
		}
	} catch (err) {
		// Fail open: L1 already ran deterministically over the four catalogue
		// languages plus the universal structural rules. Blocking every user
		// during an OpenAI outage is a worse failure than letting an off-topic
		// question through.
		//
		// The limit of that justification, stated plainly: for input in a
		// language outside the catalogue, prose-phrased injection scores 0 at L1,
		// so this branch allows it with no deterministic layer beneath it. That
		// residual is recorded in security.md S9 and is knowingly accepted —
		// refusing by script would penalise honest users while an attacker simply
		// transliterates.
		logSecurityEvent({
			feature: context.feature,
			userId: context.userId,
			layer: "L2",
			outcome: "fallback_triggered",
			ruleIds: ["l2_unavailable"],
			score: l1.score,
		});
		logger.error(err, "[aiGuard] L2 unavailable — failing open");
		return ALLOWED;
	}

	return ALLOWED;
};
