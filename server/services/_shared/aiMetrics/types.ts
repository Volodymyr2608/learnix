import type { AiFeature } from "@/server/services/_shared/aiGuard/types";

/**
 * How a measured call or turn ended.
 *
 * `guard_blocked` is deliberately NOT a member. `logSecurityEvent` already owns
 * that outcome, and the guard blocks before the turn's model call — emitting it
 * here too would count one event in two streams and inflate any failure rate
 * computed from them. A rate that needs both joins them on `feature`.
 *
 * `aborted` never produces a call line: a user who navigated away is not a
 * failure, and filing them as one poisons the signal this exists to produce. It
 * does produce a TURN line, because a turn silently missing from the sample
 * biases every latency and cost statistic computed over it.
 */
export type AiMetricOutcome =
	| "ok"
	| "retryable_error"
	| "fatal_error"
	| "aborted";

/**
 * What a metric line may carry — and, more to the point, what it may not.
 *
 * There is no field here whose type admits a prompt, a reply, a tool argument,
 * retrieved content, or an `Error.message`. That absence is the enforcement
 * mechanism for "no event carries free text", chosen over a redaction step for
 * the reason `logSecurityEvent` gives: a redactor can be forgotten, a missing
 * field cannot. `errorName` is a class name, never a message.
 *
 * The key vocabulary (`feature`, `node`) matches
 * `server/observability/projectError.ts`'s allowlist so a Sentry issue and a
 * metric line about the same turn spell the same fields the same way.
 *
 * No identifier is emitted. `userId`/`courseId` were briefly carried on the
 * context and never read by either writer — a populated-but-unread field is a
 * trap, since emitting it later is a one-line change no contract test would
 * catch. Attribution is by timestamp against the security-event log, which
 * already carries `userId`; see security.md §S7.
 */
export type AiMetricCall = {
	feature: AiFeature;
	node: string;
	model: string;
	latencyMs: number;
	promptTokens: number;
	completionTokens: number;
	/** null means the model is unpriced — never 0, which a reader would sum. */
	costUsd: number | null;
	outcome: Exclude<AiMetricOutcome, "aborted">;
	errorName?: string;
};

export type AiMetricTurn = {
	feature: AiFeature;
	calls: number;
	promptTokens: number;
	completionTokens: number;
	/** null when any call in the turn was unpriced: a partial total is a wrong total. */
	costUsd: number | null;
	wallMs: number;
	/** Present only for a streaming run; absent, not zero, for the rest. */
	ttftMs?: number;
	outcome: AiMetricOutcome;
};

/** What the caller knows about the run and the callbacks cannot discover. */
export type AiMetricContext = {
	feature: AiFeature;
	/** For a call that is not inside a graph, the name to report as `node`. */
	node?: string;
};
