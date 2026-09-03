import {
	isNodeAbort,
	isRetryable,
} from "@/server/services/_shared/aiErrors/errorShape";
import {
	FatalNodeError,
	RetryableNodeError,
} from "@/server/services/courseAI/courseAI.errors";

/**
 * The graph's error classification: the shared shape rules
 * (`_shared/aiErrors/errorShape.ts`) decide *what kind* of fault this is, and
 * this module wraps that verdict in the courseAI error classes the graph's
 * callers switch on. The split exists because `aiMetrics` and `reportError` need
 * the shape rules too and may not import from a feature service.
 */

export { isNodeAbort };

/**
 * Pure: returns the classified error, never throws it and never logs. Callers own
 * both, so the classification stays unit-testable in isolation.
 */
export const classifyNodeError = (
	err: unknown,
	node: string,
): RetryableNodeError | FatalNodeError => {
	const message = `[courseAI.graph] node "${node}" failed`;

	return isRetryable(err)
		? new RetryableNodeError(message, "SERVICE_UNAVAILABLE", err)
		: new FatalNodeError(message, "INTERNAL_SERVER_ERROR", err);
};
