import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import {
	__aggregateCountForTest,
	__featureCountForTest,
	__resetWindowsForTest,
	__windowSizeForTest,
	AGGREGATE_MAX,
	checkAiRateLimit,
	EVICT_THRESHOLD,
	MAX_MSG_LENGTH,
	validateMessageLength,
} from "./checkAiRateLimit";

const FILE = "server/services/_shared/aiLimits/checkAiRateLimit.ts";

describe("checkAiRateLimit", () => {
	beforeEach(() => __resetWindowsForTest());

	it("AiRateLimitFeature is derived, not hand-copied", () => {
		// Every behavioural test below passes against a hand-copied union with
		// today's five members, and would keep passing while a sixth AiFeature went
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

	it("shares one aggregate bucket across features (AC 39)", () => {
		let allowed = 0;
		for (let i = 0; i < 100; i++) {
			// 20 + 20 > 30, so the aggregate is what stops this, not either ceiling.
			const feature = i % 2 === 0 ? "courseAI" : "lessonAI";
			if (checkAiRateLimit("u1", feature)) allowed++;
			else break;
		}

		expect(allowed).toBe(AGGREGATE_MAX);
	});

	it("keeps each user's budget separate", () => {
		// Mixed features, because 30 courseAI calls stop bumping the aggregate at
		// its own ceiling of 20 and the aggregate would never fill.
		for (let i = 0; i < 15; i++) checkAiRateLimit("u1", "courseAI");
		for (let i = 0; i < 15; i++) checkAiRateLimit("u1", "lessonAI");

		expect(checkAiRateLimit("u1", "quizAI")).toBe(false);
		expect(checkAiRateLimit("u2", "quizAI")).toBe(true);
	});

	it("enforces the per-feature ceiling below the aggregate", () => {
		let allowed = 0;
		for (let i = 0; i < 30; i++) {
			if (checkAiRateLimit("u1", "quizAI")) allowed++;
			else break;
		}

		expect(allowed).toBe(10);
	});

	it("a request rejected by the aggregate leaves the per-feature counter alone (AC 41)", () => {
		// Exhaust the AGGREGATE with MIXED features: 20 courseAI alone hits the
		// per-feature ceiling at 20 and stops bumping, so the aggregate would never
		// reach 30 and the assertion below would fail for the wrong reason.
		for (let i = 0; i < 15; i++) checkAiRateLimit("u1", "courseAI");
		for (let i = 0; i < 15; i++) checkAiRateLimit("u1", "lessonAI");

		const before = __featureCountForTest("u1", "quizAI");
		expect(checkAiRateLimit("u1", "quizAI")).toBe(false);
		expect(__featureCountForTest("u1", "quizAI")).toBe(before);
	});

	it("countAggregate: false does not spend a second aggregate slot", () => {
		checkAiRateLimit("u1", "learningPathAI");
		const agg = __aggregateCountForTest("u1");

		checkAiRateLimit("u1", "learningPathAI", {
			scope: "c1",
			countAggregate: false,
		});

		expect(__aggregateCountForTest("u1")).toBe(agg);
	});

	it("a hostile scope cannot collide with the aggregate key (AC 40)", () => {
		// The invariant is the separator at index userId.length — ":" for a
		// feature key, " " for the aggregate — not the absence of spaces in scope.
		// Assert the aggregate is UNTOUCHED by a scope that spells it out.
		checkAiRateLimit("u1", "courseAI");
		const aggregate = __aggregateCountForTest("u1");

		for (const scope of [" aggregate", "a:b:c", "x".repeat(10_000)]) {
			checkAiRateLimit("u1", "learningPathAI", {
				scope,
				countAggregate: false,
			});
			expect(__aggregateCountForTest("u1"), scope).toBe(aggregate);
		}

		// And an empty feature name cannot reach the aggregate's key space either.
		expect(__featureCountForTest("u1", "", " aggregate")).toBe(0);
	});

	it("enforces ONE regeneration per minute per (student, course) (AC 43)", () => {
		// The rule the private learningPathAI bucket enforced before consolidation.
		// The second call to the SAME course must fail — asserting it succeeds is
		// how a 10x relaxation hides behind a passing test.
		expect(
			checkAiRateLimit("u1", "learningPathAI", {
				scope: "c1",
				countAggregate: false,
			}),
		).toBe(true);
		expect(
			checkAiRateLimit("u1", "learningPathAI", {
				scope: "c1",
				countAggregate: false,
			}),
		).toBe(false);
	});

	it("keeps that window per course, not per student (AC 43)", () => {
		checkAiRateLimit("u1", "learningPathAI", {
			scope: "c1",
			countAggregate: false,
		});

		// A different course the same student is enrolled in is a different window.
		expect(
			checkAiRateLimit("u1", "learningPathAI", {
				scope: "c2",
				countAggregate: false,
			}),
		).toBe(true);
		expect(__featureCountForTest("u1", "learningPathAI", "c1")).toBe(1);
		expect(__featureCountForTest("u1", "learningPathAI", "c2")).toBe(1);
	});

	it("leaves the unscoped ceiling alone, so the scoped rule cannot collapse it", () => {
		// A per-feature ceiling of 1 would have made this 1/min across ALL of a
		// student's courses, which is the mistake the scoped table exists to avoid.
		let allowed = 0;
		for (let i = 0; i < 12; i++) {
			if (checkAiRateLimit("u1", "learningPathAI")) allowed++;
			else break;
		}

		expect(allowed).toBe(10);
	});

	it("eviction frees space even when nothing has expired (AC 42)", () => {
		// Every entry here is live: the window is a minute and this runs in
		// milliseconds, so the expired sweep finds nothing and the fallback drop is
		// the only thing that can free space.
		let user = 0;
		while (__windowSizeForTest() <= EVICT_THRESHOLD) {
			checkAiRateLimit(`user-${user++}`, "courseAI");
		}
		const peak = __windowSizeForTest();

		// One more call: sweep finds nothing expired, so it drops the oldest 10% by
		// insertion order. No O(1) claim — above the threshold every call still runs
		// the full sweep before deciding.
		checkAiRateLimit(`user-${user}`, "courseAI");

		expect(__windowSizeForTest()).toBeLessThan(peak);
	});

	it("stays bounded under sustained pressure", () => {
		for (let i = 0; i < EVICT_THRESHOLD * 3; i++) {
			checkAiRateLimit(`user-${i}`, "courseAI");
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
