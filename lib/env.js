import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
	/**
	 * Specify your server-side environment variables schema here. This way you can ensure the app
	 * isn't built with invalid env vars.
	 */
	server: {
		BETTER_AUTH_URL: z.url(),
		BETTER_AUTH_SECRET:
			process.env.NODE_ENV === "production"
				? z.string()
				: z.string().optional(),
		BETTER_AUTH_GITHUB_CLIENT_ID: z.string(),
		BETTER_AUTH_GITHUB_CLIENT_SECRET: z.string(),
		BETTER_AUTH_GOOGLE_CLIENT_ID: z.string(),
		BETTER_AUTH_GOOGLE_CLIENT_SECRET: z.string(),
		DATABASE_URL: z.url(),
		BASE_URL: z.url(),
		OPENAI_API_KEY: z.string(),
		NODE_ENV: z
			.enum(["development", "test", "production"])
			.default("development"),
		LANGSMITH_API_KEY: z.string().optional(),
		LANGSMITH_PROJECT: z.string().optional(),
		LANGSMITH_TRACING: z
			.string()
			.transform((v) => v === "true")
			.optional(),
		LANGCHAIN_TRACING_V2: z
			.string()
			.transform((v) => v === "true")
			.optional(),
		RESEND_API_KEY: z.string().min(1),
		EMAIL_FROM_ADDRESS: z.email(),
		EMAIL_REPLY_TO: z.email().optional(),
		N8N_API_TOKEN: z.string().min(1),
		N8N_WEBHOOK_BASE_URL: z.url(),
		N8N_WEBHOOK_SECRET: z.string().min(1),
		CERTIFICATE_SECRET: z.string().min(1),
		UNSUBSCRIBE_SECRET: z.string().min(1),
		INVOICE_SECRET: z.string().min(1),
		STRIPE_SECRET_KEY: z.string().min(1),
		STRIPE_WEBHOOK_SECRET: z.string().min(1),
		STRIPE_CONNECT_WEBHOOK_SECRET: z.string().min(1),
		STRIPE_PLATFORM_FEE_PERCENT: z.coerce
			.number()
			.int()
			.min(0)
			.max(100)
			.default(20),
		/**
		 * AI rate limiter store. Optional so `next build`, CI and a fresh checkout
		 * work without Redis — the limiter falls back to its in-memory adapter.
		 * Production absence is caught by an assertion at store selection, NOT here:
		 * test/loadEnv.ts sets SKIP_ENV_VALIDATION for every test, so a refine here
		 * would never run in tests, and on Vercel it would fire at build time rather
		 * than at the cold start that actually matters.
		 *
		 * Names come from the Vercel Upstash/KV marketplace integration, not the
		 * SDK's own UPSTASH_REDIS_REST_* defaults — which is why Redis.fromEnv()
		 * cannot be used and the client is constructed explicitly.
		 *
		 * KV_REST_API_READ_ONLY_TOKEN is deliberately NOT declared. Every limiter
		 * call is an INCR, and because the store fails closed a read-only token
		 * would present as "every AI request rate-limited" rather than as a
		 * credentials error. Leaving it undeclared makes that mistake impossible.
		 * KV_URL and REDIS_URL are TCP and unusable by this HTTP client.
		 */
		KV_REST_API_URL: z.url().optional(),
		KV_REST_API_TOKEN: z.string().min(1).optional(),
		/** Distinguishes preview from production deployments sharing one Upstash DB. */
		VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
		/**
		 * Sentry ingest DSN. Optional here for the same reason KV_REST_API_URL is:
		 * test/loadEnv.ts sets SKIP_ENV_VALIDATION for every test tier and all three
		 * CI jobs do the same, so a refine here would never run where it matters and
		 * on Vercel it would fire at build time rather than at the cold start that
		 * does. The production check is an assertion at point of use — see
		 * server/observability/resolveSentryDsn.ts, the same shape as selectStore.
		 *
		 * NEXT_PUBLIC_SENTRY_DSN is deliberately NOT declared. v1 is server-side
		 * only: a public DSN is an unauthenticated write endpoint for anyone who
		 * views source, and the free tier has no per-key rate limit, so shipping one
		 * hands a stranger the ability to exhaust a 5,000-event month and blind the
		 * platform. Not declaring it is the control.
		 *
		 * The Sentry build-time auth token (see next.config.ts) is deliberately NOT
		 * declared here either. It is a build-time credential read directly there;
		 * putting it in runtimeEnv would make it reachable from every server module
		 * that imports `env`. Its name is spelled out only in next.config.ts and in
		 * server/observability/buildConfig.contract.test.ts — not here — because
		 * Next embeds this file's full source, comments included, as sourceContent
		 * in server chunk source maps, and the post-build scan in
		 * scripts/check-build-artifacts.ts greps `.next/` for that literal string.
		 */
		SENTRY_DSN: z.url().optional(),
	},

	/**
	 * Specify your client-side environment variables schema here. This way you can ensure the app
	 * isn't built with invalid env vars. To expose them to the client, prefix them with
	 * `NEXT_PUBLIC_`.
	 */
	client: {
		// NEXT_PUBLIC_CLIENTVAR: z.string(),
		/**
		 * The app's own origin, readable in the browser AND during SSR. BASE_URL is
		 * server-only, and the render policies that decide whether a URL leaves the
		 * app run in client components that Next prerenders on the server — where
		 * `window` does not exist.
		 */
		NEXT_PUBLIC_APP_URL: z.url(),
	},

	/**
	 * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
	 * middlewares) or client-side so we need to destruct manually.
	 */
	runtimeEnv: {
		BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
		BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
		BETTER_AUTH_GITHUB_CLIENT_ID: process.env.BETTER_AUTH_GITHUB_CLIENT_ID,
		BETTER_AUTH_GITHUB_CLIENT_SECRET:
			process.env.BETTER_AUTH_GITHUB_CLIENT_SECRET,
		BETTER_AUTH_GOOGLE_CLIENT_ID: process.env.BETTER_AUTH_GOOGLE_CLIENT_ID,
		BETTER_AUTH_GOOGLE_CLIENT_SECRET:
			process.env.BETTER_AUTH_GOOGLE_CLIENT_SECRET,
		DATABASE_URL: process.env.DATABASE_URL,
		NODE_ENV: process.env.NODE_ENV,
		BASE_URL: process.env.BASE_URL,
		NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
		OPENAI_API_KEY: process.env.OPENAI_API_KEY,
		LANGSMITH_API_KEY: process.env.LANGSMITH_API_KEY,
		LANGSMITH_PROJECT: process.env.LANGSMITH_PROJECT,
		LANGSMITH_TRACING: process.env.LANGSMITH_TRACING,
		LANGCHAIN_TRACING_V2: process.env.LANGCHAIN_TRACING_V2,
		RESEND_API_KEY: process.env.RESEND_API_KEY,
		EMAIL_FROM_ADDRESS: process.env.EMAIL_FROM_ADDRESS,
		EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO,
		N8N_API_TOKEN: process.env.N8N_API_TOKEN,
		N8N_WEBHOOK_BASE_URL: process.env.N8N_WEBHOOK_BASE_URL,
		N8N_WEBHOOK_SECRET: process.env.N8N_WEBHOOK_SECRET,
		CERTIFICATE_SECRET: process.env.CERTIFICATE_SECRET,
		UNSUBSCRIBE_SECRET: process.env.UNSUBSCRIBE_SECRET,
		INVOICE_SECRET: process.env.INVOICE_SECRET,
		STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
		STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
		STRIPE_CONNECT_WEBHOOK_SECRET: process.env.STRIPE_CONNECT_WEBHOOK_SECRET,
		STRIPE_PLATFORM_FEE_PERCENT: process.env.STRIPE_PLATFORM_FEE_PERCENT,
		KV_REST_API_URL: process.env.KV_REST_API_URL,
		KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN,
		VERCEL_ENV: process.env.VERCEL_ENV,
		SENTRY_DSN: process.env.SENTRY_DSN,
	},
	/**
	 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
	 * useful for Docker builds.
	 */
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
	/**
	 * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
	 * `SOME_VAR=''` will throw an error.
	 */
	emptyStringAsUndefined: true,
});
