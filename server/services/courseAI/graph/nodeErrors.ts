import { isAbortError } from "@/lib/guards/isAbortError";
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
const RETRYABLE_NAMES = new Set(["TimeoutError"]);

/**
 * The openai SDK never assigns `this.name` to its error classes, so a network
 * fault arrives with `name === "Error"` and `status === undefined` — the class is
 * legible only through the constructor. `wrapOpenAIClientError` itself matches on
 * `constructor.name` for the same reason.
 */
const RETRYABLE_CONSTRUCTORS = new Set([
	"APIConnectionError",
	"APIConnectionTimeoutError",
]);

/**
 * `@langchain/core` throws ModelAbortError — not a DOMException — whenever the
 * signal trips inside a `.invoke()` node, and `streamEvents` puts every node on
 * that path. Treating it as a failure would file an instructor who navigated away
 * as a fatal error in the very signal this classification exists to produce.
 */
export const isNodeAbort = (err: unknown): boolean =>
	isAbortError(err) || nameOf(err) === "ModelAbortError";

type ErrorShape = {
	name?: string;
	ctor?: string;
	status?: number;
	lcCode?: string;
};

function nameOf(err: unknown): string | undefined {
	if (typeof err !== "object" || err === null) return undefined;
	const name = (err as { name?: unknown }).name;
	return typeof name === "string" ? name : undefined;
}

const shapeOf = (err: unknown): ErrorShape => {
	if (typeof err !== "object" || err === null) return {};
	const candidate = err as Record<string, unknown>;
	return {
		name: nameOf(err),
		ctor: candidate.constructor?.name,
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
	const { name, ctor, status, lcCode } = shapeOf(err);

	if (lcCode) return RETRYABLE_LC_CODES.has(lcCode);
	if (name && RETRYABLE_NAMES.has(name)) return true;
	if (ctor && RETRYABLE_CONSTRUCTORS.has(ctor)) return true;
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
