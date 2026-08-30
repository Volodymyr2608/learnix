export type ToolPolicyContext = {
	userId: string;
	/** Canonical concept names for this lesson. Empty denies every write. */
	lessonConcepts: string[];
	/**
	 * Per-turn denial bookkeeping, so a model retrying inside one turn produces
	 * one event per class rather than one per attempt. Optional: a caller that
	 * has no turn to scope emits every denial.
	 */
	denials?: {
		emitted: Set<import("../_shared/aiGuard/types").SecurityOutcome>;
	};
};

/**
 * The check-authoring policy needs one fact the mastery write never did:
 * whether this turn actually read the lesson. Kept as its own type rather than
 * widened onto `ToolPolicyContext`, so the flag cannot be silently defaulted
 * away by a caller that has no notion of grounding.
 */
export type ConceptCheckPolicyContext = ToolPolicyContext & {
	/** True only if `retrieve_lesson_context` ran on this turn. */
	groundedByRetrieval: boolean;
};

/** A check exactly as the model authored it, before any server processing. */
export type ConceptCheckRequest = {
	concept: string;
	question: string;
	options: string[];
	correctOption: string;
};

export type ToolAuthorization =
	| { authorized: true; canonicalConcept: string }
	| { authorized: false; message: string };

export type ReplyValidationRuleId =
	| "system_prompt_echo"
	| "untrusted_data_echo"
	| "verbatim_chunk_echo"
	| "off_origin_link"
	| "validator_error"
	/**
	 * The reply named the answer to the check authored on the same turn. Unlike
	 * every other id here it does not reject the reply — it discards the check.
	 */
	| "concept_check_answer_echo";

export type ReplyValidationResult =
	/**
	 * `suppressCheck` is the one outcome that is neither pass nor fail: the reply
	 * is delivered and persisted, and the check authored alongside it is thrown
	 * away unwritten.
	 */
	| { valid: true; suppressCheck?: boolean }
	| { valid: false; ruleId: ReplyValidationRuleId };

export type ReplyValidationContext = {
	userId: string;
	/** Raw tool output captured during this turn — what "verbatim dump" is measured against. */
	retrievedContent: string[];
	/**
	 * The correct option of the check authored on this turn, or null when none
	 * was. Null makes the echo rule unable to fire, rather than firing against an
	 * empty string that every reply contains.
	 */
	pendingCheckAnswer?: string | null;
};
