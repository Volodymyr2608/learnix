import { NEUTRAL_REFUSAL_MESSAGE } from "@/server/services/_shared/aiGuard/messages";
import { logSecurityEvent } from "@/server/services/_shared/aiGuard/securityLog";
import {
	CONVERSATION_MAX_LEVEL,
	canonicalConceptName,
} from "@/server/services/mastery/masteryLevels";
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

	const needle = request.concept.trim().toLowerCase();
	const allowlisted = ctx.lessonConcepts.find(
		(candidate) => candidate.trim().toLowerCase() === needle,
	);
	if (!allowlisted) return deny(ctx, "concept_not_allowlisted");

	// The allowlist is model-authored insights JSON, so its entries can carry
	// padding the quiz path would have trimmed away. Storing the raw entry here
	// would put the same concept in the table twice, under two spellings, and
	// mastery is unique on the exact string.
	const canonicalConcept = canonicalConceptName(allowlisted);
	if (!canonicalConcept) return deny(ctx, "concept_not_canonicalisable");

	return { authorized: true, canonicalConcept };
};
