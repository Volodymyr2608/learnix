import * as Sentry from "@sentry/nextjs";

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
 */
export const onRequestError = Sentry.captureRequestError;
