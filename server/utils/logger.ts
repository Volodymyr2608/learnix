import { createConsola, type LogObject } from "consola";
import { reportError } from "@/server/observability/reportError";

/**
 * Normalises the argument shapes already in use across the 31 importers of this
 * module into `reportError(error, staticMessage)`. Callers use every ordering:
 *
 *  - message-first: `logger.error("Failed to update user:", error)` (user.service.ts:12)
 *  - error-first: `logger.error(err, "[aiGuard] L2 unavailable — failing open")`
 *    (guardUserInput.ts:103)
 *  - message-first with a plain data object instead of an Error instance:
 *    `logger.error("resend_failed", { templateKey, toEmail, error })`
 *    (email.service.ts:62-66)
 *  - bare single argument: `logger.error(error)` (courseAI.service.ts:42)
 *
 * Position is not load-bearing here — whichever argument is a string is the
 * static message, and whichever argument is not a string is the error/context
 * value handed to `reportError`, which itself accepts `unknown` and projects
 * whatever shape it is given (projectError.ts). A bare single-argument call has
 * no string to use as the message, so it falls back to a fixed one.
 */
const normalizeErrorArgs = (
	args: unknown[],
): { error: unknown; message: string } => {
	const message = args.find((arg): arg is string => typeof arg === "string");
	const error = args.find((arg) => typeof arg !== "string");

	return {
		error:
			error ?? message ?? new Error("logger.error called with no arguments"),
		message: message ?? "logger_error",
	};
};

export const logger = createConsola({
	formatOptions: {
		date: false,
	},
});

// The single chokepoint AC 5 requires: only `error`-level entries reach Sentry,
// and only through the funnel (`reportError`), never `@sentry/nextjs` directly.
logger.addReporter({
	log(logObj: LogObject) {
		if (logObj.type !== "error") return;

		const { error, message } = normalizeErrorArgs(logObj.args);
		reportError(error, message);
	},
});
