import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";
import { createRawRedisClient } from "@/server/services/_shared/aiLimits/store/upstash.store";

/** The two Redis commands the lock needs; injected so tests never reach the network. */
export type LockRedis = {
	set: (
		key: string,
		value: string,
		opts: { nx: true; px: number },
	) => Promise<"OK" | string | null>;
	eval: (script: string, keys: string[], args: string[]) => Promise<unknown>;
};

export type RunLock = {
	/** A token if the lock was free, null if another run holds it. */
	acquire: (name: string, ttlMs: number) => Promise<string | null>;
	/** Deletes the lock only if it still holds this token (AC-C16). */
	release: (name: string, token: string) => Promise<void>;
};

const key = (name: string) => `runlock:${name}`;

/** Compare-and-delete: a run whose TTL expired cannot release the next run's lock. */
const RELEASE_SCRIPT = `if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`;

export const createRedisRunLock = (redis: LockRedis): RunLock => ({
	acquire: async (name, ttlMs) => {
		const token = randomUUID();
		const result = await redis.set(key(name), token, { nx: true, px: ttlMs });
		return result === "OK" ? token : null;
	},
	release: async (name, token) => {
		await redis.eval(RELEASE_SCRIPT, [key(name)], [token]);
	},
});

/** Per-process lock for development and tests only (H7). */
export const createMemoryRunLock = (now: () => number = Date.now): RunLock => {
	const held = new Map<string, { token: string; expiresAt: number }>();
	const isHeld = (name: string) => {
		const entry = held.get(name);
		return entry !== undefined && entry.expiresAt > now();
	};
	return {
		acquire: async (name, ttlMs) => {
			if (isHeld(name)) return null;
			const token = randomUUID();
			held.set(name, { token, expiresAt: now() + ttlMs });
			return token;
		},
		release: async (name, token) => {
			if (held.get(name)?.token === token) held.delete(name);
		},
	};
};

const MEMORY_ALLOWED_ENVS = new Set(["development", "test"]);

export const selectRunLock = (config: {
	nodeEnv: string;
	url: string | undefined;
	token: string | undefined;
}): RunLock => {
	const { nodeEnv, url, token } = config;
	if (url && token) {
		const redis = createRawRedisClient(url, token);
		return createRedisRunLock({
			set: (k, v, opts) => redis.set(k, v, opts),
			eval: (script, keys, args) => redis.eval(script, keys, args),
		});
	}
	if (!MEMORY_ALLOWED_ENVS.has(nodeEnv)) {
		throw new Error(
			`Payout run lock: KV_REST_API_URL and KV_REST_API_TOKEN must be set when NODE_ENV is "${nodeEnv}" — a per-instance lock does not stop overlapping serverless runs (ADR-037 §3.2).`,
		);
	}
	return createMemoryRunLock();
};

let cached: RunLock | undefined;

/** Resolved on first use, not at import, so `next build` works without KV (as the AI limiter). */
export const getRunLock = (): RunLock => {
	cached ??= selectRunLock({
		nodeEnv: env.NODE_ENV,
		url: env.KV_REST_API_URL,
		token: env.KV_REST_API_TOKEN,
	});
	return cached;
};
