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
 * The ONLY environments allowed to run on the in-memory adapter. An allowlist,
 * not `nodeEnv !== "production"`, because `lib/env.js`'s `.default("development")`
 * does not apply when SKIP_ENV_VALIDATION is set — which lib/env.js itself
 * recommends for Docker builds. `nodeEnv` is then raw `process.env.NODE_ENV`, and
 * if that is unset a deny-list check would silently hand a production deploy the
 * Map and put "airl:v1:undefined:" in the key namespace. Anything unrecognised
 * now fails instead.
 */
const MEMORY_ALLOWED_ENVS = new Set(["development", "test"]);

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

	if (!MEMORY_ALLOWED_ENVS.has(nodeEnv)) {
		const missing = [
			url ? null : "KV_REST_API_URL",
			token ? null : "KV_REST_API_TOKEN",
		].filter(Boolean);

		throw new Error(
			`AI rate limiter: ${missing.join(" and ")} must be set when NODE_ENV is ` +
				`"${nodeEnv}". Falling back to the in-memory limiter would make the ceiling ` +
				"per-instance, which does not hold on serverless (risk R3).",
		);
	}

	return memoryStore;
};

let cached: RateLimitStore | undefined;

/**
 * Resolved once, on FIRST USE, then memoised — not at module load (AC 18).
 *
 * Import-time selection looked equivalent and was not: `next build` runs with
 * `NODE_ENV=production`, and this module is reachable from the root router that
 * every RSC page pulls in, so the production assertion fired during **prerender**
 * and a build without the credentials failed. That contradicted AC 16, which
 * promises `pnpm build` and a fresh checkout work without Redis.
 *
 * Deferring costs nothing on the deployment that matters: on serverless, first
 * use *is* the cold start. A misconfigured production deploy still fails loudly
 * and still fails CLOSED — the throw propagates out of `checkAndBump`, so no
 * request is ever served with the limiter silently absent.
 */
export const getRateLimitStore = (): RateLimitStore => {
	cached ??= selectStore({
		nodeEnv: env.NODE_ENV,
		url: env.KV_REST_API_URL,
		token: env.KV_REST_API_TOKEN,
	});
	return cached;
};

/** Test-only: drop the memo so a test can exercise a different configuration. */
export const __resetStoreSelectionForTest = (): void => {
	cached = undefined;
};

/**
 * A thin indirection so the limiter can be constructed at import time while the
 * store behind it is still resolved lazily. Every method forwards through the
 * memoised getter; none of them re-reads the environment after the first call.
 */
export const rateLimitStore: RateLimitStore = {
	checkAndBump: (windows, windowMs) =>
		getRateLimitStore().checkAndBump(windows, windowMs),
	countForTest: (key) => getRateLimitStore().countForTest(key),
	resetForTest: () => getRateLimitStore().resetForTest(),
	sizeForTest: () => getRateLimitStore().sizeForTest(),
};
