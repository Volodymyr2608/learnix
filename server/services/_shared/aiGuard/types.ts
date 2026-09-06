import type { AiMetricsHandler } from "@/server/services/_shared/aiMetrics/handler";
import type { DecoderId } from "./decoders";
export type GuardLayer = "L1" | "L2";
export type GuardOutcome = "allow" | "off_topic" | "blocked";
export type L1Verdict = "allow" | "suspect" | "block";

export type L1Result = {
	verdict: L1Verdict;
	score: number;
	matchedRuleIds: string[];
	/**
	 * Which decoders surfaced a rule the raw view did not. Empty for a plaintext
	 * payload, and empty for a homoglyph one — folding is normalization applied
	 * to every haystack, not a decoder (see decoders.ts).
	 */
	decoders: DecoderId[];
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
	/**
	 * The turn's metrics handler, built by the route BEFORE the guard runs.
	 *
	 * Required, not optional: L2 is a model call on every turn, and an optional
	 * field here is a silent unmetering waiting to happen — a caller that omits
	 * it compiles, passes every test, and drops the guard's cost from the turn.
	 * Building it in the route is also what puts the L2 wait inside the turn's
	 * measured latency, where the student experiences it.
	 */
	metrics: AiMetricsHandler;
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
	| "model_call_fallback"
	// A write to a durable educational record. Not a guard layer: nothing here
	// decides whether a call proceeds, and the events it emits are evidence for a
	// later investigation rather than detection.
	| "mastery_write";

export type SecurityOutcome =
	| "guard_blocked"
	| "guard_off_topic"
	| "guard_suspect"
	| "unsafe_tool_call"
	| "output_validation_failed"
	// A tool declining an ordinary "not now" — no concepts on the lesson yet, a
	// check already open, a budget spent. Routine by construction and therefore
	// never forwarded: routing these into `unsafe_tool_call` destroyed the one
	// property that made a zero-baseline alert worth having, and
	// `fallback_triggered` would be the same mistake with a different label.
	| "tool_call_declined"
	| "fallback_triggered"
	// D-L: a prior-field write that stands on a turn whose reply was retracted.
	// courseAI's analogue of the retired mastery_write_retained.
	| "content_revised_retained"
	// Level 3 written because every quiz on a lesson was answered correctly. The
	// normal, successful path — recorded so a suspected fabrication has something
	// to be reconstructed from.
	| "mastery_promoted";

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
	/**
	 * Which decoders surfaced the payload, when any did. Id-only and closed, like
	 * `ruleIds` and `subject`: the point of this field set being exhaustive by
	 * type is that there is nowhere to put the message text, and a provenance
	 * field typed as `string[]` would have quietly reopened that.
	 */
	decoders?: DecoderId[];
};
