import { NEUTRAL_REFUSAL_MESSAGE } from "@/server/services/_shared/aiGuard/messages";
import { logSecurityEvent } from "@/server/services/_shared/aiGuard/securityLog";
import { resolveAllowlistedConcept } from "@/server/services/_shared/concepts/conceptKey";
import { CONVERSATION_MAX_LEVEL } from "@/server/services/mastery/masteryLevels";
import type {
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

const deny = (ctx: ToolPolicyContext, ruleId: string): ToolAuthorization => {
	logSecurityEvent({
		feature: "lessonAI",
		userId: ctx.userId,
		layer: "tool_policy",
		outcome: "unsafe_tool_call",
		ruleIds: [ruleId],
		score: 0,
	});
	return { authorized: false, message: NEUTRAL_REFUSAL_MESSAGE };
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
