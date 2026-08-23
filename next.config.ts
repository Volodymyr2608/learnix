/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import { withSentryConfig } from "@sentry/nextjs";
import "./lib/env.js";

/** @type {import("next").NextConfig} */
const config = {
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "jhutb95vm6eik0be.public.blob.vercel-storage.com",
				port: "",
			},
			{
				protocol: "https",
				hostname: "lh3.googleusercontent.com",
				port: "",
			},
		],
	},
	headers: async () => [
		{
			source: "/push/esputnik/push-esputnik-sw.js",
			headers: [{ key: "Service-Worker-Allowed", value: "/" }],
		},
	],
};

/**
 * Sentry build-time wiring. See docs/specs/features/error-observability/spec.md.
 *
 * SENTRY_AUTH_TOKEN is read here and ONLY here — it is a build credential, so it is
 * deliberately absent from lib/env.js's runtimeEnv, where every server module that
 * imports `env` could reach it (AC 29).
 *
 * Three settings are load-bearing and each is pinned by a contract test:
 *  - tunnelRoute is NOT set (AC 34). It would generate an unauthenticated route
 *    handler on our own origin that forwards arbitrary bodies to Sentry ingest — a
 *    new public endpoint under ADR-017 Rules 1 and 3, and an open relay that makes
 *    our domain the source of any flood. Sentry's own recommended snippet includes
 *    it, so its absence here is an active decision, not an oversight.
 *  - widenClientFileUpload stays false (AC 35). It additionally uploads server
 *    chunks, which would place server/services/_shared/aiGuard/patterns/** — a
 *    detector whose value is partly its non-publication — into the artifact bundle.
 *  - deleteSourcemapsAfterUpload is set true explicitly even though it is already
 *    the default, so the contract test pins a literal rather than a default that a
 *    later SDK version could change. Without it the maps are uploaded AND served
 *    publicly.
 */
export default withSentryConfig(config, {
	org: "learnix-fb",
	project: "javascript-nextjs",
	authToken: process.env.SENTRY_AUTH_TOKEN,
	silent: !process.env.CI,
	widenClientFileUpload: false,
	sourcemaps: { deleteSourcemapsAfterUpload: true },
	disableLogger: true,
});
