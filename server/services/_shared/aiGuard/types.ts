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
