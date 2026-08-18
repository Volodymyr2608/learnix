import type {
	AiFeature,
	SecuritySubject,
} from "@/server/services/_shared/aiGuard/types";

export type AiOutputRuleId =
	| "system_prompt_echo"
	| "untrusted_data_echo"
	| "off_origin_link"
	// The boundary itself failed. Its own id so a validator bug is visible in the
	// event stream rather than indistinguishable from a real detection.
	| "validator_error";

export type ModelTextContext = {
	feature: AiFeature;
	userId: string;
	/** Who authored the content, when that is not the user who triggered the call. */
	subject?: SecuritySubject;
	/**
	 * Silence the security event for this call. Reserved for a caller that
	 * enforces at one point and reports at another, so that one rejected text
	 * still produces exactly one event. Allow-listed by contract test — a third
	 * caller would be a rejection that enforces and never reports.
	 */
	emit?: false;
};

export type ModelTextResult =
	| { valid: true }
	| { valid: false; ruleId: AiOutputRuleId };
