export type ToolPolicyContext = {
	userId: string;
	/** Canonical concept names for this lesson. Empty denies every write. */
	lessonConcepts: string[];
};

export type MarkConceptRequest = {
	concept: string;
	level: number;
};

export type ToolAuthorization =
	| { authorized: true; canonicalConcept: string }
	| { authorized: false; message: string };

export type ReplyValidationRuleId =
	| "system_prompt_echo"
	| "untrusted_data_echo"
	| "verbatim_chunk_echo"
	| "off_origin_link"
	| "validator_error";

export type ReplyValidationResult =
	| { valid: true }
	| { valid: false; ruleId: ReplyValidationRuleId };

export type ReplyValidationContext = {
	userId: string;
	/** Raw tool output captured during this turn — what "verbatim dump" is measured against. */
	retrievedContent: string[];
};
