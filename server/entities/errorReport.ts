import { z } from "zod";

/**
 * spec.md AC 7 / security.md S5: the input schema for
 * app/_components/ErrorBoundary/actions.ts's server action IS the security control,
 * not a formality. That action is a PUBLIC write path into the Sentry issue stream —
 * an error boundary can fire for a logged-out visitor, so no auth gates it — and the
 * Developer plan has no per-key rate limit ahead of it. The schema is closed by
 * construction:
 *
 *  - There is no `message` (or any other free-text) field. That is the one thing that
 *    would let an anonymous caller choose the transmitted issue title/body outright.
 *  - Unknown properties are silently stripped — Zod's `z.object()` default behaviour,
 *    not `.strict()` — so a caller that sends `message`, `stack`, or anything else
 *    never gets it forwarded past this parse.
 *  - Every field is a length-capped scalar. These values are meant to be short and
 *    machine-shaped (a JS error class name, a Next.js error digest, a route pathname)
 *    — not prose — so the caps here are tight, well under the 500-char defence-in-depth
 *    cap applied at the redaction layer (`server/observability/redact.ts`).
 */

const MAX_ERROR_CLASS_LENGTH = 100;
const MAX_ROUTE_LENGTH = 300;
const MAX_DIGEST_LENGTH = 100;

/**
 * Identifier-shaped: starts with a letter, then only letters/digits/underscore/dot.
 * Matches every real value this field receives — a JS built-in `Error.name`
 * ("TypeError"), a custom error class name, or a tRPC `TRPC_ERROR_CODE_KEY`
 * ("UNAUTHORIZED", "NOT_FOUND", ...) — while rejecting spaces or punctuation a
 * free-text phrase would need. A length cap alone still lets a short readable phrase
 * through (AC 7 / S5): this is the "no free text" control itself, not a formality.
 */
const ERROR_CLASS_SHAPE = /^[A-Za-z][A-Za-z0-9_.]*$/;

/**
 * Pathname-shaped: starts with "/", then only word characters, hyphens, and further
 * slashes — matches every `usePathname()` / `window.location.pathname` value this app
 * produces, including nested and dynamic-segment routes (e.g.
 * "/dashboard/courses/abc123"), while rejecting spaces, query strings, or other
 * free-text content a length cap alone would still admit.
 */
const ROUTE_SHAPE = /^\/[\w/-]*$/;

export const errorReportInput = z.object({
	/**
	 * Next.js's error-boundary digest, correlating this report with the matching
	 * server log line. Only present for errors caught by app/error.tsx or
	 * app/global-error.tsx — a manually-caught client mutation failure has none.
	 */
	digest: z.string().max(MAX_DIGEST_LENGTH).optional(),
	errorClass: z
		.string()
		.min(1)
		.max(MAX_ERROR_CLASS_LENGTH)
		.regex(ERROR_CLASS_SHAPE),
	route: z.string().min(1).max(MAX_ROUTE_LENGTH).regex(ROUTE_SHAPE),
});

export type ErrorReportInput = z.infer<typeof errorReportInput>;
