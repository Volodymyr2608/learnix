import { beforeEach, describe, expect, it } from "vitest";
import { createRateLimiter } from "../checkAiRateLimit";
import { describeRateLimiterContract } from "./storeContract";
import {
	createRedisClient,
	createUpstashStore,
	keyPrefix,
} from "./upstash.store";

const url = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_TOKEN;
const configured = Boolean(url && token);

// describe.skipIf still EVALUATES the callback, so these are constructed even
// when the tier skips. Placeholders keep @upstash/redis from warning about a
// missing url on a fresh checkout; nothing is ever sent to them.
const newStore = () =>
	createUpstashStore(url ?? "http://localhost:0", token ?? "unused");

/**
 * Skips rather than fails when the SRH container is not running, so a fresh
 * checkout stays green without Redis — but NOT in CI, where skipping silently
 * would mean the only adapter with behavioural coverage is the one production
 * never uses.
 */
describe("redis tier is actually configured in CI", () => {
	it("has KV_REST_API_URL and KV_REST_API_TOKEN when CI is set", () => {
		// Guards the guard: without this, deleting the `redis` job from ci.yml
		// turns every test below into a silent skip and the suite still reports
		// green, taking the evidence for R3's closure with it.
		if (!process.env.CI) return;
		expect(configured).toBe(true);
	});
});

describe.skipIf(!configured)("upstash store against a real Redis", () => {
	const store = newStore();

	// The same nine behavioural properties the memory adapter passes. Running the
	// identical suite against both adapters is what makes the Lua script match the
	// Map rather than merely approximate it.
	describeRateLimiterContract("upstash", store);

	describe("distribution (AC 9) — the property that closes R3", () => {
		beforeEach(async () => {
			await store.resetForTest();
		});

		it("shares one ceiling across two independent clients", async () => {
			// Two clients standing in for two Vercel serverless instances. On the
			// memory adapter each would hold its own Map and BOTH loops would be
			// allowed in full — that is exactly risk R3, and it is why this test
			// belongs to the Redis adapter alone.
			const instanceA = createRateLimiter(newStore());
			const instanceB = createRateLimiter(newStore());

			let allowed = 0;
			for (let i = 0; i < 12; i++) {
				if (await instanceA.checkAiRateLimit("u-dist", "quizAI")) allowed++;
			}
			for (let i = 0; i < 12; i++) {
				if (await instanceB.checkAiRateLimit("u-dist", "quizAI")) allowed++;
			}

			// quizAI's ceiling is 10. Per-instance counting would give 20.
			expect(allowed).toBe(10);
		});

		it("counts one aggregate budget across instances too", async () => {
			const instanceA = createRateLimiter(newStore());
			const instanceB = createRateLimiter(newStore());

			let allowed = 0;
			for (let i = 0; i < 40; i++) {
				const limiter = i % 2 === 0 ? instanceA : instanceB;
				const feature = i % 4 < 2 ? "courseAI" : "lessonAI";
				if (await limiter.checkAiRateLimit("u-agg", feature)) allowed++;
			}

			// AGGREGATE_MAX is 30. Per-instance counting would give 40.
			expect(allowed).toBe(30);
		});

		it("keeps the scoped learningPathAI rule to 1/min across instances", async () => {
			const instanceA = createRateLimiter(newStore());
			const instanceB = createRateLimiter(newStore());

			expect(
				await instanceA.checkAiRateLimit("u-scoped", "learningPathAI", {
					scope: "c1",
					countAggregate: false,
				}),
			).toBe(true);
			// A second instance must not grant a second regeneration in the window.
			expect(
				await instanceB.checkAiRateLimit("u-scoped", "learningPathAI", {
					scope: "c1",
					countAggregate: false,
				}),
			).toBe(false);
		});
	});

	describe("fixed window (AC 11)", () => {
		const redis = createRedisClient(
			url ?? "http://localhost:0",
			token ?? "unused",
		);

		beforeEach(async () => {
			await store.resetForTest();
		});

		it("sets a TTL on first use and does not extend it on later calls", async () => {
			// A rolling window would refresh the TTL on every increment, so steady
			// traffic would hold the window open and it would never reset.
			await store.checkAndBump([{ key: "ttl-probe", max: 10 }], 60_000);
			const pttl = () =>
				redis.eval(
					"return redis.call('PTTL', KEYS[1])",
					[`${keyPrefix()}ttl-probe`],
					[],
				) as Promise<number>;

			const first = await pttl();

			await new Promise((resolve) => setTimeout(resolve, 200));
			await store.checkAndBump([{ key: "ttl-probe", max: 10 }], 60_000);
			const second = await pttl();

			expect(second).toBeLessThan(first);
			expect(await store.countForTest("ttl-probe")).toBe(2);
		});

		it("expires the window, allowing calls again", async () => {
			for (let i = 0; i < 2; i++) {
				await store.checkAndBump([{ key: "short", max: 2 }], 300);
			}
			expect(await store.checkAndBump([{ key: "short", max: 2 }], 300)).toBe(
				false,
			);

			await new Promise((resolve) => setTimeout(resolve, 450));

			expect(await store.checkAndBump([{ key: "short", max: 2 }], 300)).toBe(
				true,
			);
		});
	});
});
