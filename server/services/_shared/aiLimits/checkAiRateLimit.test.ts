import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import {
	__resetWindowsForTest,
	checkAiRateLimit,
	MAX_MSG_LENGTH,
	validateMessageLength,
} from "./checkAiRateLimit";
import {
	__windowSizeForTest,
	EVICT_THRESHOLD,
	memoryStore,
} from "./store/memory.store";
import { describeRateLimiterContract } from "./store/storeContract";

const FILE = "server/services/_shared/aiLimits/checkAiRateLimit.ts";

// The nine behavioural properties. The identical suite runs against the Upstash
// adapter in upstash.redis.test.ts — that pairing is what makes the port real.
describeRateLimiterContract("memory", memoryStore);

describe("checkAiRateLimit policy declarations", () => {
	it("AiRateLimitFeature is derived, not hand-copied", () => {
		// Every behavioural test passes against a hand-copied union with today's
		// five members, and would keep passing while a sixth AiFeature went
		// unlimited. Only the source text distinguishes the two.
		expect(readFileSync(FILE, "utf-8")).toMatch(
			/export type AiRateLimitFeature = AiFeature;?\s*$/m,
		);
	});

	it("has no per-feature fallback that a sixth surface could inherit", () => {
		const code = readFileSync(FILE, "utf-8")
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.replace(/\/\/.*$/gm, "");

		expect(code).toMatch(/PER_FEATURE_MAX:\s*Record<AiFeature, number>/);
		expect(code).not.toMatch(/PER_FEATURE_MAX\[feature\]\s*\?\?/);
	});
});

/**
 * Memory-adapter-only. Redis bounds its key space with TTLs, so there is no
 * equivalent code path to test on the other adapter — which is why these two
 * are not in the shared contract suite.
 */
describe("memory adapter eviction", () => {
	beforeEach(async () => {
		await __resetWindowsForTest();
	});

	it("eviction frees space even when nothing has expired (AC 42)", async () => {
		// Every entry here is live: the window is a minute and this runs in
		// milliseconds, so the expired sweep finds nothing and the fallback drop is
		// the only thing that can free space.
		let user = 0;
		while (__windowSizeForTest() <= EVICT_THRESHOLD) {
			await checkAiRateLimit(`user-${user++}`, "courseAI");
		}
		const peak = __windowSizeForTest();

		// One more call: sweep finds nothing expired, so it drops the oldest 10% by
		// insertion order. No O(1) claim — above the threshold every call still runs
		// the full sweep before deciding.
		await checkAiRateLimit(`user-${user}`, "courseAI");

		expect(__windowSizeForTest()).toBeLessThan(peak);
	});

	it("stays bounded under sustained pressure", async () => {
		for (let i = 0; i < EVICT_THRESHOLD * 3; i++) {
			await checkAiRateLimit(`user-${i}`, "courseAI");
		}

		// Two entries per user (aggregate + feature) for 15,000 users would be
		// 30,000 without eviction; the map oscillates just above the threshold.
		expect(__windowSizeForTest()).toBeLessThanOrEqual(EVICT_THRESHOLD + 4);
	});
});

describe("validateMessageLength", () => {
	it("accepts a message at the limit and rejects one past it", () => {
		expect(validateMessageLength("x".repeat(MAX_MSG_LENGTH))).toBe(true);
		expect(validateMessageLength("x".repeat(MAX_MSG_LENGTH + 1))).toBe(false);
	});
});
