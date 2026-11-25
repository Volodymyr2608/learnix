import { describe, expect, it } from "vitest";
import {
	createMemoryRunLock,
	createRedisRunLock,
	type LockRedis,
	selectRunLock,
} from "./runLock";

/** A fake with Redis semantics for SET NX PX and the compare-and-delete script. */
const fakeRedis = (clock: { now: number }): LockRedis => {
	const store = new Map<string, { value: string; expiresAt: number }>();
	const live = (key: string) => {
		const entry = store.get(key);
		if (entry && entry.expiresAt <= clock.now) store.delete(key);
		return store.get(key);
	};
	return {
		set: async (key, value, opts) => {
			if (live(key)) return null;
			store.set(key, { value, expiresAt: clock.now + opts.px });
			return "OK";
		},
		eval: async (_script, [key], [token]) => {
			if (live(key ?? "")?.value !== token) return 0;
			store.delete(key ?? "");
			return 1;
		},
	};
};

const TTL = 15 * 60 * 1000;

describe.each([
	["redis", (clock: { now: number }) => createRedisRunLock(fakeRedis(clock))],
	["memory", (clock: { now: number }) => createMemoryRunLock(() => clock.now)],
])("run lock (%s) — AC-C16", (_name, make) => {
	it("refuses a second holder while the lock is held", async () => {
		const lock = make({ now: 0 });

		const first = await lock.acquire("payouts", TTL);
		const second = await lock.acquire("payouts", TTL);

		expect(first).toEqual(expect.any(String));
		expect(second).toBeNull();
	});

	it("never releases a newer holder's lock with a stale token", async () => {
		const clock = { now: 0 };
		const lock = make(clock);
		const stale = await lock.acquire("payouts", TTL);
		clock.now = TTL + 1; // the first run outlived its TTL
		const fresh = await lock.acquire("payouts", TTL);

		await lock.release("payouts", stale ?? "");

		expect(fresh).not.toBeNull();
		expect(await lock.acquire("payouts", TTL)).toBeNull();
	});

	it("can be taken again after release or after the TTL", async () => {
		const clock = { now: 0 };
		const lock = make(clock);
		const token = await lock.acquire("payouts", TTL);
		await lock.release("payouts", token ?? "");
		expect(await lock.acquire("payouts", TTL)).not.toBeNull();

		clock.now = TTL;
		expect(await lock.acquire("payouts", TTL)).not.toBeNull();
	});
});

describe("selectRunLock (H7)", () => {
	it("uses memory without KV in development and test", () => {
		expect(() =>
			selectRunLock({ nodeEnv: "test", url: undefined, token: undefined }),
		).not.toThrow();
	});

	it("refuses to run without KV in production", () => {
		expect(() =>
			selectRunLock({
				nodeEnv: "production",
				url: undefined,
				token: undefined,
			}),
		).toThrow(/KV_REST_API_URL/);
	});
});
