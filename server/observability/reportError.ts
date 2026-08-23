import * as Sentry from "@sentry/nextjs";
import { isNodeAbort } from "@/server/services/courseAI/graph/nodeErrors";
import { isCaptured, markCaptured } from "./capturedMarker";
import { fingerprintFor } from "./fingerprint";
import {
	type ProjectionContext,
	pickAllowlistedContext,
	projectError,
} from "./projectError";

/**
 * The ONLY module in the application that calls the Sentry SDK's capture APIs.
 *
 * Two other files may import @sentry/nextjs — sentry.server.config.ts (init) and
 * instrumentation.ts (onRequestError) — and a contract test enforces that boundary.
 * It is not a style rule: projectError is the enforcement point for AC 10/11, so a
 * module that calls Sentry.captureException directly hands Sentry the real error, and
 * OutputParserException.message is the entire model output, which becomes the issue
 * title. A direct call also skips the AC 2 dedup marker and the AC 41 abort filter.
 *
 * Everything else imports reportError / reportMessage / enrichScope from here.
 */

export type { ProjectionContext };

/**
 * Report a thrown error. Idempotent per error instance: the second call for the same
 * error tags it and returns, so safeRequest needs no special-casing (AC 2).
 */
export const reportError = (
	error: unknown,
	staticMessage: string,
	context?: ProjectionContext,
): void => {
	// Client aborts are not failures. courseAI/graph/nodeErrors.ts:37-38 deliberately
	// excludes them from the failure signal, and SSE routes abort routinely when a
	// user navigates away — reporting them would both pollute the stream and burn
	// quota (AC 41).
	if (isNodeAbort(error)) return;

	if (context?.op) Sentry.getIsolationScope().setTag("operation", context.op);

	if (isCaptured(error)) return;
	markCaptured(error);

	const { root, extra } = projectError(error, staticMessage, context);
	Sentry.captureException(root, {
		extra,
		fingerprint: fingerprintFor(error, context),
	});
};

/**
 * Report a signal that is not an error — currently only aiGuard's zero-baseline
 * security outcomes (AC 36).
 *
 * `message` and `fingerprint` must be server-authored by the caller and never built
 * from user or model text. `context` goes through the same allowlist as reportError,
 * so no extra field can ride along.
 */
export const reportMessage = (
	message: string,
	fingerprint: readonly string[],
	context?: ProjectionContext,
): void => {
	Sentry.captureMessage(message, {
		level: "warning",
		fingerprint: [...fingerprint],
		extra: pickAllowlistedContext(context),
	});
};

/**
 * Attach context to the current request's scope WITHOUT capturing (AC 3).
 *
 * handleServiceError calls this; the tRPC middleware performs the one capture later,
 * further up the same call stack.
 *
 * getIsolationScope(), not getCurrentScope() and not withScope(). Three reasons, in
 * order of how easy they are to get wrong:
 *
 *  - withScope() would be actively broken here: its scope is discarded when its
 *    callback returns, which is before the middleware ever runs.
 *  - The isolation scope is the per-request one, and Sentry merges global +
 *    isolation + current scope at capture time — so anything set here is included by
 *    any capture during the request, even if something forks the current scope in
 *    between.
 *  - It matches what the SDK itself does: wrapServerComponentWithSentry reaches for
 *    getIsolationScope() rather than forking its own, which is also the evidence
 *    that the RSC path (createCaller, not a route handler) already has one — the
 *    fork happens upstream in the per-request HTTP instrumentation. That is why
 *    trpc/server.ts needs no wrapper of its own.
 */
export const enrichScope = (
	key: string,
	context: Record<string, unknown>,
): void => {
	Sentry.getIsolationScope().setContext(key, context);
};
