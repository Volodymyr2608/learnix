import { env } from "@/lib/env";
import { memoryStore } from "./memory.store";
import type { RateLimitStore } from "./types";
import { createUpstashStore } from "./upstash.store";

export type StoreConfig = {
	nodeEnv: string;
	url?: string;
	token?: string;
};

/**
 * Pure and exported so the production assertion is testable — a throw at module
 * load is not.
 *
 * That assertion is the point of this function. The credentials are optional in
 * lib/env.js so CI and a fresh checkout need no Redis; without a hard failure in
 * production, a forgotten Vercel variable would put the platform back on the
 * per-process Map with the whole suite, and the `resourceLimits: APPLIED`
 * conformance row, still green. The most likely real-world failure mode of this
 * feature is that it was never switched on (security.md S6).
 */
export const selectStore = (config: StoreConfig): RateLimitStore => {
	const { nodeEnv, url, token } = config;

	if (url && token) return createUpstashStore(url, token);

	if (nodeEnv === "production") {
		const missing = [
			url ? null : "KV_REST_API_URL",
			token ? null : "KV_REST_API_TOKEN",
		].filter(Boolean);

		throw new Error(
			`AI rate limiter: ${missing.join(" and ")} must be set in production. ` +
				"Falling back to the in-memory limiter would make the ceiling per-instance, " +
				"which does not hold on serverless (risk R3).",
		);
	}

	return memoryStore;
};

/** Bound once, at module load. No call path re-reads the environment (AC 18). */
export const rateLimitStore: RateLimitStore = selectStore({
	nodeEnv: env.NODE_ENV,
	url: env.KV_REST_API_URL,
	token: env.KV_REST_API_TOKEN,
});
