"use server";

import { errorReportInput } from "@/server/entities/errorReport";
import { reportError } from "@/server/observability/reportError";

/**
 * The message is server-authored and fixed — never built from `input`, so this cannot
 * become the free-text relay S5 warns about even if the schema below were ever loosened.
 */
const STATIC_MESSAGE = "client_reported_error";

/**
 * `server/observability/fingerprint.ts` (frozen — Task 1-12) groups by
 * `error.constructor.name`, not `error.name`. A plain `new Error()` would therefore
 * always fingerprint as "Error" no matter what class the caller reports, so every
 * client-reported error on a route would collapse into one issue regardless of its
 * real type. AC 23 groups this action's reports by "route + error class" — so the
 * constructed error's *class itself* has to carry the caller-supplied name, not just
 * its `.name` property.
 */
const namedClientError = (errorClass: string): Error => {
	class ClientReportedError extends Error {}
	Object.defineProperty(ClientReportedError, "name", { value: errorClass });
	const error = new ClientReportedError();
	error.name = errorClass;
	return error;
};

/**
 * The one write path from the browser into the Sentry issue stream (spec.md AC 7,
 * security.md S5). `input` is unauthenticated and untrusted by definition — a boundary
 * can fire for a logged-out visitor — so it is parsed, never trusted; a payload that
 * fails validation is silently dropped rather than reported.
 *
 * Two call shapes reach this, deliberately:
 *  - `ErrorFallback`, behind both `app/error.tsx` (route-level) and
 *    `app/global-error.tsx` (root-level) React error boundaries, whose `Error` carries
 *    an optional Next.js `digest`.
 *  - A handful of Client Components that catch a tRPC mutation's `onError` instead of
 *    throwing into a boundary (spec.md "8. Converted call sites"). They have no
 *    `digest` — it is specific to server-rendering errors Next.js's boundaries
 *    receive — so they simply omit it.
 *
 * `digest` is accepted (closing the shape per AC 7) but not currently forwarded to
 * Sentry: `server/observability/projectError.ts`'s context allowlist has no slot for
 * it, and a per-occurrence digest would be actively wrong to fingerprint or tag by — it
 * is unique per error, so using it for grouping would give every occurrence its own
 * issue. Extending that allowlist is out of this task's scope.
 */
export const reportClientError = async (input: unknown): Promise<void> => {
	const parsed = errorReportInput.safeParse(input);
	if (!parsed.success) return;

	const { errorClass, route } = parsed.data;

	reportError(namedClientError(errorClass), STATIC_MESSAGE, { path: route });
};
