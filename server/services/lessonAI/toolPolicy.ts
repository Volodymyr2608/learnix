import { NEUTRAL_REFUSAL_MESSAGE } from "@/server/services/_shared/aiGuard/messages";
import { logSecurityEvent } from "@/server/services/_shared/aiGuard/securityLog";
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
 * Conversation may raise mastery to 2. Level 3 is reachable only by completing
 * every quiz on the lesson (quiz.service.ts) — confirmation by action, not by
 * text, because a persuasive message is not evidence of understanding.
 */
export const CONVERSATION_MAX_LEVEL = 2;

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
	const canonicalConcept = ctx.lessonConcepts.find(
		(candidate) => candidate.trim().toLowerCase() === needle,
	);
	if (!canonicalConcept) return deny(ctx, "concept_not_allowlisted");

	return { authorized: true, canonicalConcept };
};
