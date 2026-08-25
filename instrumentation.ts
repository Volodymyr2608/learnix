import type { Instrumentation } from "next";
import { reportError } from "@/server/observability/reportError";

/**
 * Next.js instrumentation hook. Called once when a server instance boots, before it
 * accepts requests.
 *
 * Only the nodejs branch exists: this app has no middleware.ts and no edge routes —
 * all four `runtime` exports in the tree are "nodejs" — so an edge config would be
 * dead weight that still has to be kept correct.
 */
export const register = async (): Promise<void> => {
	if (process.env.NEXT_RUNTIME === "nodejs") {
		await import("./sentry.server.config");
	}
};

/**
 * Fires for errors thrown from route handlers, server actions, server components and
 * middleware (AC 6) — the surfaces the tRPC middleware does not cover.
 *
 * This is one of the feature's five capture points, so it goes through `reportError`
 * like the other four. It deliberately does NOT re-export `Sentry.captureRequestError`:
 * that helper calls `captureException(error)` on the RAW error, which skips the AC 10
 * projection (an `OutputParserException` message is the entire model output, and it
 * would become the issue title), the AC 2 dedup marker, the AC 23 server-authored
 * fingerprint and the AC 41 abort filter. It also pushes the request headers onto the
 * scope as SDK processing metadata.
 *
 * The dedup marker is what makes this hook safe to leave enabled. Several RSC pages
 * call the tRPC caller directly rather than through `safeRequest` —
 * `app/dashboard/certificates/page.tsx`, `app/dashboard/billing/page.tsx`,
 * `app/(admin)/admin/page.tsx`, `app/dashboard/checkout/success/page.tsx`,
 * `app/dashboard/courses/[courseId]/review/page.tsx` and
 * `app/_components/Instructor/CourseAnalytics/index.tsx` — so a failure there is seen
 * first by `timingMiddleware` and then again here as it unwinds. Routed through
 * `reportError`, the second sighting is a no-op instead of a second, unprojected event.
 */
export const onRequestError: Instrumentation.onRequestError = (
	error,
	_request,
	errorContext,
) => {
	reportError(error, "request_failed", { path: errorContext.routePath });
};
