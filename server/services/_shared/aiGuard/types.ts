export type GuardLayer = "L1" | "L2";
export type GuardOutcome = "allow" | "off_topic" | "blocked";
export type L1Verdict = "allow" | "suspect" | "block";

export type L1Result = {
	verdict: L1Verdict;
	score: number;
	matchedRuleIds: string[];
};

export type GuardDomain = {
	/** Injected into L2's prompt: what counts as on-topic for this surface. */
	description: string;
	/** Used to build the user-facing off-topic message. */
	subject: string;
};

export type GuardContext = {
	feature: "courseAI" | "lessonAI";
	userId: string;
	domain: GuardDomain;
};

export type GuardResult = {
	outcome: GuardOutcome;
	layer: GuardLayer | null;
	matchedRuleIds: string[];
	score: number;
	/** User-facing text; null when outcome === "allow". Never names a rule or layer. */
	message: string | null;
};

export type UntrustedSource =
	| "lesson_content"
	| "course_data"
	| "lesson_summary"
	| "path_candidates"
	// Text another model wrote. Its own label because a critic model's prose is
	// not lesson content, and mislabelling it defeats the reason the region is
	// marked at all (security.md S7, false negative #2).
	| "model_output";

/**
 * Every surface that constructs a model call. Standalone on purpose: it was
 * aliased to GuardContext["feature"], which is why three surfaces could not emit
 * a security event at all (G2).
 *
 * GuardContext["feature"] stays narrow — only the two chat surfaces run the input
 * guard. These two unions and AiRateLimitFeature are three declarations with
 * three jobs; TypeScript cannot tell a derived alias from a hand-copied union, so
 * the guard against a future "remove the duplication" refactor is a source-text
 * contract test, not the type system.
 */
export type AiFeature =
	| "courseAI"
	| "lessonAI"
	| "lessonInsightsAI"
	| "quizAI"
	| "learningPathAI";

/** Telemetry vocabulary. Separate from GuardOutcome, which drives control flow. */
export type SecurityLayer =
	| "L1"
	| "L2"
	| "tool_policy"
	| "output_validation"
	// A model call that failed and was answered with a degraded path instead of an
	// error. Its own value because callers would otherwise pick "L2" as the nearest
	// fit and the layer field would stop discriminating.
	| "model_call_fallback";

export type SecurityOutcome =
	| "guard_blocked"
	| "guard_off_topic"
	// L2 judged the message an attempt to override instructions, extract the
	// prompt, or reassign the role — independently of topic. Its own value
	// because filing it as guard_off_topic is what made injections invisible in
	// the telemetry (security.md S3); the user-facing refusal is deliberately
	// identical, so this field is the only place the distinction exists.
	| "guard_instruction_override"
	| "guard_suspect"
	| "unsafe_tool_call"
	| "output_validation_failed"
	// A mastery write committed on a turn whose reply was then retracted by
	// output validation. The write is not rolled back (it passed its own
	// authorization); this correlates the retained side effect with the
	// adversarial signal for review. See security.md S7/S13 §24.
	| "mastery_write_retained"
	| "fallback_triggered"
	// D-L: a prior-field write that stands on a turn whose reply was retracted.
	// courseAI's analogue of mastery_write_retained.
	| "content_revised_retained";

/**
 * Who authored the content that tripped the boundary, when that is not the user
 * who triggered the call. On insights / quiz / path, `userId` is the operator and
 * never the author. Id-only and closed, so "no event carries free text, enforced
 * by the type" survives the addition.
 */
export type SecuritySubject = {
	kind: "lesson" | "course" | "generation" | "quiz";
	id: string;
};

export type SecurityEvent = {
	feature: AiFeature;
	userId: string;
	layer: SecurityLayer;
	outcome: SecurityOutcome;
	ruleIds: string[];
	score: number;
	subject?: SecuritySubject;
};
