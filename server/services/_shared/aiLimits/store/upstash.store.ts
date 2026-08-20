import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";
import type { LimitWindow, RateLimitStore } from "./types";

/**
 * One round trip, bounded. The limiter sits on the hot path of every AI request,
 * and an unreachable store must not hold an SSE route open until the 30s model
 * timeout — that would turn a dependency outage into resource exhaustion on our
 * own side.
 */
export const STORE_TIMEOUT_MS = 1_000;

/**
 * Bumped when the key SHAPE changes, so a redeploy cannot half-read counters
 * written under the old layout. The environment segment keeps a Vercel preview
 * deployment off production's buckets when both point at one Upstash database.
 */
export const keyPrefix = (): string =>
	`airl:v1:${env.VERCEL_ENV ?? env.NODE_ENV}:`;

/**
 * Atomic multi-window check-then-bump. Redis runs a script atomically, which is
 * what replaces the "no await between peek and bump" guarantee the in-memory
 * adapter gets from Node's single thread. Two round trips would not be atomic.
 *
 * KEYS: one per window.  ARGV: [windowMs, max_1 … max_n].
 *
 * The two loops are the contract: EVERY key is checked before ANY is
 * incremented, so a rejected call spends nothing — otherwise a caller already
 * over one ceiling also burns their aggregate budget.
 *
 * PEXPIRE fires only on the transition to 1. Refreshing it on every increment
 * would turn the fixed window into a rolling one that steady traffic never
 * resets.
 */
export const CHECK_AND_BUMP_SCRIPT = `
local windowMs = tonumber(ARGV[1])
for i = 1, #KEYS do
  local current = tonumber(redis.call('GET', KEYS[i]) or '0')
  if current >= tonumber(ARGV[i + 1]) then
    return 0
  end
end
for i = 1, #KEYS do
  if redis.call('INCR', KEYS[i]) == 1 then
    redis.call('PEXPIRE', KEYS[i], windowMs)
  end
end
return 1
`;

/**
 * Exactly the four commands this adapter issues.
 *
 * The client is a constructor parameter rather than a private field with a test
 * seam, because @upstash/redis auto-pipelines: `redis.eval` is routed through a
 * proxy, so assigning over it after construction does not intercept the call —
 * a stub silently reaches the network instead. Injection is the only seam that
 * actually holds.
 */
export type RedisLike = {
	eval: (script: string, keys: string[], args: string[]) => Promise<unknown>;
	get: <T>(key: string) => Promise<T | null>;
	keys: (pattern: string) => Promise<string[]>;
	del: (...keys: string[]) => Promise<number>;
};

export const createRedisClient = (url: string, token: string): RedisLike =>
	new Redis({
		url,
		token,
		signal: () => AbortSignal.timeout(STORE_TIMEOUT_MS),
		// No retries: a retry doubles latency on every AI request to buy a second
		// chance at a call that failing closed already handles. Budget over blip.
		retry: { retries: 0 },
	});

export const createUpstashStore = (
	url: string,
	token: string,
	client?: RedisLike,
): RateLimitStore => {
	const redis = client ?? createRedisClient(url, token);

	const prefixed = (key: string) => `${keyPrefix()}${key}`;

	return {
		checkAndBump: async (
			windows: readonly LimitWindow[],
			windowMs: number,
		): Promise<boolean> => {
			try {
				const result = await redis.eval(
					CHECK_AND_BUMP_SCRIPT,
					windows.map((window) => prefixed(window.key)),
					[String(windowMs), ...windows.map((window) => String(window.max))],
				);
				return Number(result) === 1;
			} catch (error) {
				// FAIL CLOSED. The limiter caps real spend and prices a brute-force
				// search; a limiter that opens under load is not a limiter, because
				// inducing that load is cheap. The availability cost is deliberate and
				// recorded in the feature's security.md S4.
				console.error(
					"[aiLimits] rate-limit store unavailable — failing closed",
					error,
				);
				return false;
			}
		},

		countForTest: async (key: string): Promise<number> => {
			const value = await redis.get<string | number | null>(prefixed(key));
			return value === null || value === undefined ? 0 : Number(value);
		},

		resetForTest: async (): Promise<void> => {
			const keys = await redis.keys(`${keyPrefix()}*`);
			if (keys.length > 0) await redis.del(...keys);
		},
	};
};
