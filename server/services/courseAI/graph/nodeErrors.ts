import {
	FatalNodeError,
	RetryableNodeError,
} from "@/server/services/courseAI/courseAI.errors";

/**
 * `@langchain/openai` rewrites provider errors before a node ever sees them
 * (`wrapOpenAIClientError`): a connection timeout arrives as a plain Error named
 * "TimeoutError" with its status stripped, and 401/404/429 arrive tagged with an
 * `lc_error_code`. So classification keys off shape — name, tag, status — never
 * off message text, which providers reword without notice.
 *
 * `openai` is not a direct dependency of this app, so its error classes cannot be
 * imported for `instanceof` checks even if they survived the rewrite.
 */
const RETRYABLE_LC_CODES = new Set(["MODEL_RATE_LIMIT"]);
const RETRYABLE_NAMES = new Set(["TimeoutError", "APIConnectionError"]);

type ErrorShape = {
	name?: string;
	status?: number;
	lcCode?: string;
};

const shapeOf = (err: unknown): ErrorShape => {
	if (typeof err !== "object" || err === null) return {};
	const candidate = err as Record<string, unknown>;
	return {
		name: typeof candidate.name === "string" ? candidate.name : undefined,
		status: typeof candidate.status === "number" ? candidate.status : undefined,
		lcCode:
			typeof candidate.lc_error_code === "string"
				? candidate.lc_error_code
				: undefined,
	};
};

/**
 * Fails closed: anything unrecognised is fatal. An unknown shape is far more
 * likely a bug in this codebase than a transient provider fault, and a bug shown
 * to the instructor as "try again" is a bug they will retry forever.
 */
const isRetryable = (err: unknown): boolean => {
	const { name, status, lcCode } = shapeOf(err);

	if (lcCode) return RETRYABLE_LC_CODES.has(lcCode);
	if (name && RETRYABLE_NAMES.has(name)) return true;
	if (status !== undefined) return status >= 500;

	return false;
};

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
