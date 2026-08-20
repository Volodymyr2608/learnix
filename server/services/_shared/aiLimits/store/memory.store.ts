import type { LimitWindow, RateLimitStore } from "./types";

/**
 * Memory-adapter-only. Redis bounds its key space with TTLs and has no
 * equivalent code path, which is why this constant lives here and not with the
 * policy in checkAiRateLimit.ts.
 */
export const EVICT_THRESHOLD = 5_000;

type Entry = { count: number; resetAt: number };

/**
 * Pinned on globalThis, not module scope. Next bundles route handlers, the tRPC
 * handler and the RSC server separately, so module-scope state is per bundle
 * instance: "one aggregate bucket" would silently become two or three inside a
 * single process, and every unit test would still pass, because they import the
 * module once. Same pattern as server/db.ts.
 */
const globalForLimits = globalThis as unknown as {
	aiRateWindows?: Map<string, Entry>;
};
const windows = globalForLimits.aiRateWindows ?? new Map<string, Entry>();
globalForLimits.aiRateWindows = windows;

const evict = (now: number): void => {
	if (windows.size <= EVICT_THRESHOLD) return;

	const before = windows.size;
	for (const [key, entry] of windows) {
		if (now >= entry.resetAt) windows.delete(key);
	}
	if (windows.size < before) return;

	// Nothing expired — a burst of live keys. Dropping the oldest 10% by INSERTION
	// order resets ~500 windows at once, i.e. a fresh budget for ~500 users, and it
	// fires exactly under the load where the ceiling matters. Fails OPEN, never
	// closed. Reaching it needs ~170+ concurrently active users at full rate; a
	// single account cannot steer it, because a rejected call never increments.
	const surplus = Math.ceil(windows.size * 0.1);
	let dropped = 0;
	for (const key of windows.keys()) {
		windows.delete(key);
		if (++dropped >= surplus) break;
	}
};

const peek = (key: string, now: number): Entry | undefined => {
	const entry = windows.get(key);
	return !entry || now >= entry.resetAt ? undefined : entry;
};

const bump = (key: string, now: number, windowMs: number): void => {
	const entry = peek(key, now);
	if (!entry) windows.set(key, { count: 1, resetAt: now + windowMs });
	else entry.count++;
};

export const memoryStore: RateLimitStore = {
	checkAndBump: async (
		list: readonly LimitWindow[],
		windowMs: number,
	): Promise<boolean> => {
		const now = Date.now();
		evict(now);

		// Every window is evaluated BEFORE any is incremented, and there is no await
		// between the two loops, so this stays atomic within Node's single thread.
		for (const window of list) {
			if ((peek(window.key, now)?.count ?? 0) >= window.max) return false;
		}
		for (const window of list) bump(window.key, now, windowMs);

		return true;
	},

	countForTest: async (key: string): Promise<number> =>
		peek(key, Date.now())?.count ?? 0,

	resetForTest: async (): Promise<void> => windows.clear(),

	sizeForTest: async (): Promise<number> => windows.size,
};

/** Memory-adapter-only: the eviction tests assert on total key count. */
export const __windowSizeForTest = (): number => windows.size;
