export type ToolPolicyContext = {
	userId: string;
	/** Canonical concept names for this lesson. Empty denies every write. */
	lessonConcepts: string[];
	/**
	 * Per-turn denial bookkeeping, so a model retrying inside one turn produces
	 * one event per outcome and rule rather than one per attempt. Optional: a
	 * caller that has no turn to scope emits every denial.
	 *
	 * Referenced, not restated. This was a structural copy of `TurnDenialLedger`
	 * and item 16 changed what the set holds — two declarations of one shape are
	 * how the compiler stops noticing they disagree.
	 */
	denials?: import("./toolPolicy").TurnDenialLedger;
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
	/**
	 * True once retrieval has RUN this turn, whether or not it found anything.
	 * Distinct from `groundedByRetrieval`, which requires lesson text to have
	 * come back: on a lesson with no indexed chunks the two disagree, and that
	 * gap is the only place the tutor can be told to stop retrying. Optional, so
	 * a caller with no notion of it gets the actionable message as before.
	 */
	retrievalAttempted?: boolean;
};

/** A check exactly as the model authored it, before any server processing. */
export type ConceptCheckRequest = {
	concept: string;
	question: string;
	options: string[];
	correctOption: string;
};

export type ToolAuthorization =
	| {
			authorized: true;
			canonicalConcept: string;
			/**
			 * The correct answer as it appears in `options`, byte for byte.
			 *
			 * The policy matches `correctOption` against the options after folding,
			 * so the model may hand back "The Base Case." for an option spelled
			 * "The base case". Grading is byte equality against a stored option, so
			 * the caller must persist THIS string: storing the model's rendering
			 * would store an answer none of the offered options match, and the
			 * check could never be answered correctly.
			 */
			canonicalCorrectOption: string;
	  }
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
