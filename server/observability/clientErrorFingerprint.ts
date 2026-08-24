import type { TRPCError } from "@trpc/server";

type TRPCCode = ConstructorParameters<typeof TRPCError>[0]["code"];

/**
 * Bounds the fingerprint cardinality of the ONE public write path into the issue
 * stream (`app/_components/ErrorBoundary/actions.ts`, spec.md AC 7 / security.md S5).
 *
 * AC 24's throttle is per fingerprint — 10 events per minute per bucket. AC 23 requires
 * every fingerprint to be built from server-authored values, and on this path it was
 * not: `fingerprintFor` builds `[context.path, error.constructor.name]`, and both halves
 * came straight from the unauthenticated caller. `errorReport.ts`'s schema constrains
 * their *shape* but not their *cardinality*, so a script varying `errorClass` by one
 * character per call gets a fresh 10-event budget every time — roughly 500 requests to
 * spend a 5,000-event month and blind the platform.
 *
 * The route is dropped from grouping entirely (it stays in `extra` for diagnosis) and
 * the class is bucketed against a closed set, so the whole path can produce at most
 * `KNOWN_ERROR_CLASSES.size + 1` buckets no matter what anyone sends. Dropping the route
 * also fixes a legitimate-traffic problem: dynamic segments like
 * `/dashboard/courses/<id>` gave every course its own issue.
 *
 * Values outside the set are bucketed rather than rejected — `ErrorFallback` forwards
 * `error.name`, which any dependency can set to anything, and dropping those reports
 * would lose the signal this path exists to carry.
 */
export const CLIENT_ERROR_FINGERPRINT_ROOT = "client_reported_error";

const UNKNOWN_CLASS_BUCKET = "other";

/**
 * A total `Record<TRPCCode, true>`, not an array: `TRPC_ERROR_CODE_KEY` is a closed
 * union, so a tRPC upgrade that adds a code fails to compile until someone classifies
 * it. Same mechanism, and the same reason, as AC 37a's `Record<SecurityOutcome, boolean>`.
 * The client sends these as `error.data?.code`.
 */
const TRPC_ERROR_CODES: Record<TRPCCode, true> = {
	BAD_GATEWAY: true,
	BAD_REQUEST: true,
	CLIENT_CLOSED_REQUEST: true,
	CONFLICT: true,
	FORBIDDEN: true,
	GATEWAY_TIMEOUT: true,
	INTERNAL_SERVER_ERROR: true,
	METHOD_NOT_SUPPORTED: true,
	NOT_FOUND: true,
	NOT_IMPLEMENTED: true,
	PARSE_ERROR: true,
	PAYLOAD_TOO_LARGE: true,
	PAYMENT_REQUIRED: true,
	PRECONDITION_FAILED: true,
	PRECONDITION_REQUIRED: true,
	SERVICE_UNAVAILABLE: true,
	TIMEOUT: true,
	TOO_MANY_REQUESTS: true,
	UNAUTHORIZED: true,
	UNPROCESSABLE_CONTENT: true,
	UNSUPPORTED_MEDIA_TYPE: true,
};

/** Every `Error.name` the language itself produces, plus the two the browser adds. */
const JS_ERROR_NAMES = [
	"AbortError",
	"AggregateError",
	"DOMException",
	"Error",
	"EvalError",
	"RangeError",
	"ReferenceError",
	"SyntaxError",
	"TypeError",
	"URIError",
] as const;

/** The fallback `ErrorFallback` and the mutation handlers send when there is no code. */
const TRPC_CLIENT_ERROR = "TRPCClientError";

export const KNOWN_ERROR_CLASSES: ReadonlySet<string> = new Set([
	...Object.keys(TRPC_ERROR_CODES),
	...JS_ERROR_NAMES,
	TRPC_CLIENT_ERROR,
]);

export const clientErrorFingerprint = (errorClass: string): string[] => [
	CLIENT_ERROR_FINGERPRINT_ROOT,
	KNOWN_ERROR_CLASSES.has(errorClass) ? errorClass : UNKNOWN_CLASS_BUCKET,
];
