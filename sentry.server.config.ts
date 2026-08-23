import * as Sentry from "@sentry/nextjs";
import { fingerprintKeyOf } from "@/server/observability/fingerprint";
import { LINKED_ERROR_DEPTH } from "@/server/observability/projectError";
import { redactEvent } from "@/server/observability/redact";
import { resolveSentryDsn } from "@/server/observability/resolveSentryDsn";
import { throttle } from "@/server/observability/throttle";

/**
 * Server-side Sentry initialisation.
 *
 * Reached ONLY through instrumentation.ts's dynamic import inside register(), which
 * Next calls once at server bootstrap — not during `next build`'s page-data
 * collection. That is why resolveSentryDsn can assert eagerly here, unlike
 * aiLimits/store/index.ts which had to defer to first use because it was reachable at
 * import time from the root tRPC router. On serverless, bootstrap IS the cold start,
 * so the assertion still fires exactly where it matters.
 *
 * Consequence worth knowing: `pnpm preview` (next build && next start) with
 * NODE_ENV=production and no SENTRY_DSN now throws at boot. That is AC 30 working,
 * not a regression.
 */
Sentry.initWithoutDefaultIntegrations({
	dsn: resolveSentryDsn(process.env.NODE_ENV ?? "", process.env.SENTRY_DSN),

	// Preview deployments must not merge into production's issue stream (AC 32).
	environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",

	/**
	 * Errors only (AC 33). The free tier allows 5,000 errors and 10,000 spans per
	 * month, and performance spans over AI work would duplicate — at quota cost —
	 * what LangSmith already provides under ADR-013.
	 */
	tracesSampleRate: 0,

	// AC 18. The user object carries { id } and nothing else: no email, no username,
	// no ip_address.
	sendDefaultPii: false,

	// Bounded so an unreachable ingest host cannot hold a shutdown open (AC 38).
	shutdownTimeout: 2,

	/**
	 * initWithoutDefaultIntegrations, then name what we want.
	 *
	 * Filtering the default list would mitigate SDK default drift by vigilance — you
	 * have to notice a new entry. Starting from nothing closes it structurally: a
	 * future release adding captureConsoleIntegration or extraErrorDataIntegration
	 * cannot reintroduce raw error objects into `extra`, because it cannot appear in
	 * a list we construct ourselves. This is security.md S14's residual, closed.
	 */
	integrations: [
		// Pinned to the same constant projectError walks to, so the two cannot drift.
		Sentry.linkedErrorsIntegration({ limit: LINKED_ERROR_DEPTH }),
		Sentry.dedupeIntegration(),
		Sentry.inboundFiltersIntegration(),
	],

	beforeSend: (event) => {
		// AC 24. Note Dedupe does not cover this: it suppresses only consecutive
		// identical events, and an outage's events arrive interleaved.
		if (throttle.shouldThrottle(fingerprintKeyOf(event))) return null;

		// Defence in depth. The enforcement point is projectError's allowlist; this
		// catches anything that reached Sentry by a path that bypassed it.
		return redactEvent(event);
	},
});
