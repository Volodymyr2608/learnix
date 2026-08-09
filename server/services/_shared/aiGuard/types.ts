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
	| "path_candidates";

/** Telemetry vocabulary. Separate from GuardOutcome, which drives control flow. */
export type SecurityLayer = "L1" | "L2" | "tool_policy" | "output_validation";

export type SecurityOutcome =
	| "guard_blocked"
	| "guard_off_topic"
	| "guard_suspect"
	| "unsafe_tool_call"
	| "output_validation_failed"
	// A mastery write committed on a turn whose reply was then retracted by
	// output validation. The write is not rolled back (it passed its own
	// authorization); this correlates the retained side effect with the
	// adversarial signal for review. See security.md S7/S13 §24.
	| "mastery_write_retained"
	| "fallback_triggered";

export type SecurityEvent = {
	feature: GuardContext["feature"];
	userId: string;
	layer: SecurityLayer;
	outcome: SecurityOutcome;
	ruleIds: string[];
	score: number;
};
