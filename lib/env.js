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
		STRIPE_SECRET_KEY: z.string().min(1),
		STRIPE_WEBHOOK_SECRET: z.string().min(1),
		STRIPE_CONNECT_WEBHOOK_SECRET: z.string().min(1),
		STRIPE_PLATFORM_FEE_PERCENT: z.coerce
			.number()
			.int()
			.min(0)
			.max(100)
			.default(20),
	},

	/**
	 * Specify your client-side environment variables schema here. This way you can ensure the app
	 * isn't built with invalid env vars. To expose them to the client, prefix them with
	 * `NEXT_PUBLIC_`.
	 */
	client: {
		// NEXT_PUBLIC_CLIENTVAR: z.string(),
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
		STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
		STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
		STRIPE_CONNECT_WEBHOOK_SECRET: process.env.STRIPE_CONNECT_WEBHOOK_SECRET,
		STRIPE_PLATFORM_FEE_PERCENT: process.env.STRIPE_PLATFORM_FEE_PERCENT,
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
