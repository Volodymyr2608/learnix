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

/**
 * The one default integration we keep, selected BY NAME rather than by letting the
 * default list through (see the `integrations` note below).
 *
 * `DistDirRewriteFrames` is added only by `@sentry/nextjs`'s own `init()`. It rewrites
 * every stack frame's `.next/...` absolute path to `app:///_next/...`, which is the
 * path the uploaded artifacts are keyed by — without it the source maps `next.config.ts`
 * uploads resolve against nothing and the whole upload apparatus (AC 35) is silently
 * inert. The SDK does not export the integration, so it cannot be constructed here; it
 * can only be picked out of the defaults.
 */
const KEPT_DEFAULT_INTEGRATIONS = new Set(["DistDirRewriteFrames"]);

Sentry.init({
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
	 * Construct the list ourselves, then re-admit defaults by NAME allowlist.
	 *
	 * `integrations` as a function REPLACES the resolved list outright
	 * (`@sentry/core/integration.js:29-31`) — it is not merged with the defaults. So a
	 * future release adding captureConsoleIntegration or extraErrorDataIntegration
	 * cannot reintroduce raw error objects into `extra`: it would have to be named
	 * here first. That is security.md S14's residual, closed structurally rather than
	 * by vigilance.
	 *
	 * This used to be `initWithoutDefaultIntegrations` with a plain array. That
	 * function is `@sentry/node`'s, merely re-exported by `@sentry/nextjs` through its
	 * `Object.keys(node)` sweep (`build/cjs/index.server.js:67-69`) — so it skipped
	 * everything `@sentry/nextjs`'s own `init()` does: the `isBuild()` and
	 * already-initialised guards, `applySdkMetadata(opts, "nextjs")`, the injected
	 * release name, the processor that drops React postpone/Suspense control-flow
	 * throws (they are not errors, and each one would cost quota), and
	 * `DistDirRewriteFrames`. See build/sdk-defaults.md for the full comparison.
	 */
	integrations: (defaults) => [
		// Pinned to the same constant projectError walks to, so the two cannot drift.
		Sentry.linkedErrorsIntegration({ limit: LINKED_ERROR_DEPTH }),
		Sentry.dedupeIntegration(),
		Sentry.inboundFiltersIntegration(),
		...defaults.filter((integration) =>
			KEPT_DEFAULT_INTEGRATIONS.has(integration.name),
		),
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
