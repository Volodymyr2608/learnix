"use server";

import { errorReportInput } from "@/server/entities/errorReport";
import {
	CLIENT_ERROR_FINGERPRINT_ROOT,
	clientErrorFingerprint,
} from "@/server/observability/clientErrorFingerprint";
import { reportMessage } from "@/server/observability/reportError";

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
 *
 * `reportMessage`, not `reportError`. There is no error object here and no stack worth
 * transmitting — the report is a class name and a route — and `reportMessage` is the
 * one funnel entry that takes an EXPLICIT server-chosen fingerprint. `reportError`
 * would instead route through `fingerprintFor`'s generic `[path, class]`, and on this
 * path both halves are caller-supplied, which is the AC 24 quota-enumeration hole
 * `clientErrorFingerprint` exists to close. It also retires the `namedClientError`
 * shim, which existed only to feed `error.constructor.name` into that generic rule.
 */
export const reportClientError = async (input: unknown): Promise<void> => {
	const parsed = errorReportInput.safeParse(input);
	if (!parsed.success) return;

	const { errorClass, route } = parsed.data;

	reportMessage(
		CLIENT_ERROR_FINGERPRINT_ROOT,
		clientErrorFingerprint(errorClass),
		{ path: route },
	);
};
