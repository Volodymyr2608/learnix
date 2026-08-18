/**
 * The bounds every waited model call runs under.
 *
 * MODEL_TIMEOUT_MS bounds ONE CALL, not one turn: 30s x (1 + 2 retries) is 90s
 * per call, and a courseAI turn chains classify_intent -> tool_router(xn) ->
 * tool_node -> chat_response -> assess_completion -> extract_step_data ->
 * validate -> confidence_score. Without a turn-level deadline the request-level
 * worst case is minutes, with recursionLimit as the only other bound — which is
 * why TURN_DEADLINE_MS exists and is applied at the two streaming call sites.
 */
export const MODEL_TIMEOUT_MS = 30_000;
export const MODEL_MAX_RETRIES = 2;
export const GRAPH_RECURSION_LIMIT = 25;

/** Bounds one TURN: a chained graph can exceed the per-call budget many times over. */
export const TURN_DEADLINE_MS = 120_000;

/**
 * The caller's abort signal, combined with the turn deadline. Passing only the
 * request signal leaves a stalled graph running until the per-call timeouts
 * expire one chained node at a time.
 */
export const withTurnDeadline = (signal?: AbortSignal): AbortSignal => {
	const deadline = AbortSignal.timeout(TURN_DEADLINE_MS);
	return signal ? AbortSignal.any([signal, deadline]) : deadline;
};
