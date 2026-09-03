import type {
	AiMetricCall,
	AiMetricTurn,
} from "@/server/services/_shared/aiMetrics/types";
import { logger } from "@/server/utils/logger";

/**
 * The one place a metric is written.
 *
 * Two rules hold this module, and both are pinned by contract tests rather than
 * by review:
 *
 * 1. **`info`, never `error`.** `server/utils/logger.ts` forwards only
 *    `error`-level entries to Sentry, whose free tier is 5,000 events a month.
 *    One line per model call at that level would exhaust the quota during normal
 *    operation and blind the platform to real errors — the same flood
 *    `error-observability` S6 documents, reached from the opposite direction.
 *
 * 2. **A failing sink must not fail the turn.** This runs on every model call on
 *    every surface, including inside the input guard. `logSecurityEvent` already
 *    learned this about its own forward: "a throwing sink would not merely lose
 *    an event — it would propagate out of the policy and fail the student's
 *    turn. The alert path must not be able to break the path it is watching."
 *    A lost metric is the acceptable failure here; a lost turn is not.
 */
const write = (fields: Record<string, unknown>, message: string): void => {
	try {
		logger.info(fields, message);
	} catch {
		// Deliberately silent, and deliberately not `logger.warn`: the sink that
		// just threw is the one a warning would go to. Swallowing here is what
		// keeps rule 2 true even when the logger itself is the fault.
	}
};

export const emitCall = (call: AiMetricCall): void =>
	write(
		{
			feature: call.feature,
			node: call.node,
			model: call.model,
			latencyMs: call.latencyMs,
			promptTokens: call.promptTokens,
			completionTokens: call.completionTokens,
			costUsd: call.costUsd,
			outcome: call.outcome,
			...(call.errorName ? { errorName: call.errorName } : {}),
		},
		"[aiMetrics] call",
	);

export const emitTurn = (turn: AiMetricTurn): void =>
	write(
		{
			feature: turn.feature,
			calls: turn.calls,
			promptTokens: turn.promptTokens,
			completionTokens: turn.completionTokens,
			costUsd: turn.costUsd,
			wallMs: turn.wallMs,
			...(turn.ttftMs === undefined ? {} : { ttftMs: turn.ttftMs }),
			outcome: turn.outcome,
		},
		"[aiMetrics] turn",
	);
