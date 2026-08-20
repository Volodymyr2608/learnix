import { beforeEach, describe, expect, it } from "vitest";
import { AGGREGATE_MAX, createRateLimiter } from "../checkAiRateLimit";
import type { RateLimitStore } from "./types";

/**
 * The nine behavioural properties of the limiter, run against ANY store.
 *
 * The eviction tests are deliberately absent: they describe the memory
 * adapter's evict() algorithm, which Redis replaces with TTLs and has no
 * counterpart for. The two source-text scans are absent for the same reason in
 * reverse — they assert on the policy file, not on storage.
 *
 * A port whose adapters are tested separately is a port whose adapters diverge.
 * This file is what stops the Lua script from merely approximating the Map.
 */
export const describeRateLimiterContract = (
	label: string,
	store: RateLimitStore,
): void => {
	describe(`rate limiter contract — ${label}`, () => {
		const {
			checkAiRateLimit,
			aggregateCountForTest,
			featureCountForTest,
			resetForTest,
		} = createRateLimiter(store);

		beforeEach(async () => {
			await resetForTest();
		});

		it("shares one aggregate bucket across features (AC 39)", async () => {
			let allowed = 0;
			for (let i = 0; i < 100; i++) {
				// 20 + 20 > 30, so the aggregate is what stops this, not either ceiling.
				const feature = i % 2 === 0 ? "courseAI" : "lessonAI";
				if (await checkAiRateLimit("u1", feature)) allowed++;
				else break;
			}

			expect(allowed).toBe(AGGREGATE_MAX);
		});

		it("keeps each user's budget separate", async () => {
			// Mixed features, because 30 courseAI calls stop bumping the aggregate at
			// its own ceiling of 20 and the aggregate would never fill.
			for (let i = 0; i < 15; i++) await checkAiRateLimit("u1", "courseAI");
			for (let i = 0; i < 15; i++) await checkAiRateLimit("u1", "lessonAI");

			expect(await checkAiRateLimit("u1", "quizAI")).toBe(false);
			expect(await checkAiRateLimit("u2", "quizAI")).toBe(true);
		});

		it("enforces the per-feature ceiling below the aggregate", async () => {
			let allowed = 0;
			for (let i = 0; i < 30; i++) {
				if (await checkAiRateLimit("u1", "quizAI")) allowed++;
				else break;
			}

			expect(allowed).toBe(10);
		});

		it("a request rejected by the aggregate leaves the per-feature counter alone (AC 41)", async () => {
			// Exhaust the AGGREGATE with MIXED features: 20 courseAI alone hits the
			// per-feature ceiling at 20 and stops bumping, so the aggregate would never
			// reach 30 and the assertion below would fail for the wrong reason.
			for (let i = 0; i < 15; i++) await checkAiRateLimit("u1", "courseAI");
			for (let i = 0; i < 15; i++) await checkAiRateLimit("u1", "lessonAI");

			const before = await featureCountForTest("u1", "quizAI");
			expect(await checkAiRateLimit("u1", "quizAI")).toBe(false);
			expect(await featureCountForTest("u1", "quizAI")).toBe(before);
		});

		it("countAggregate: false does not spend a second aggregate slot", async () => {
			await checkAiRateLimit("u1", "learningPathAI");
			const agg = await aggregateCountForTest("u1");

			await checkAiRateLimit("u1", "learningPathAI", {
				scope: "c1",
				countAggregate: false,
			});

			expect(await aggregateCountForTest("u1")).toBe(agg);
		});

		it("a hostile scope cannot collide with the aggregate key (AC 40)", async () => {
			// The invariant is the separator at index userId.length — ":" for a
			// feature key, " " for the aggregate — not the absence of spaces in scope.
			// Assert the aggregate is UNTOUCHED by a scope that spells it out.
			await checkAiRateLimit("u1", "courseAI");
			const aggregate = await aggregateCountForTest("u1");

			for (const scope of [" aggregate", "a:b:c", "x".repeat(10_000)]) {
				await checkAiRateLimit("u1", "learningPathAI", {
					scope,
					countAggregate: false,
				});
				expect(await aggregateCountForTest("u1"), scope).toBe(aggregate);
			}

			// And an empty feature name cannot reach the aggregate's key space either.
			expect(await featureCountForTest("u1", "", " aggregate")).toBe(0);
		});

		it("enforces ONE regeneration per minute per (student, course) (AC 43)", async () => {
			// The rule the private learningPathAI bucket enforced before consolidation.
			// The second call to the SAME course must fail — asserting it succeeds is
			// how a 10x relaxation hides behind a passing test.
			expect(
				await checkAiRateLimit("u1", "learningPathAI", {
					scope: "c1",
					countAggregate: false,
				}),
			).toBe(true);
			expect(
				await checkAiRateLimit("u1", "learningPathAI", {
					scope: "c1",
					countAggregate: false,
				}),
			).toBe(false);
		});

		it("keeps that window per course, not per student (AC 43)", async () => {
			await checkAiRateLimit("u1", "learningPathAI", {
				scope: "c1",
				countAggregate: false,
			});

			// A different course the same student is enrolled in is a different window.
			expect(
				await checkAiRateLimit("u1", "learningPathAI", {
					scope: "c2",
					countAggregate: false,
				}),
			).toBe(true);
			expect(await featureCountForTest("u1", "learningPathAI", "c1")).toBe(1);
			expect(await featureCountForTest("u1", "learningPathAI", "c2")).toBe(1);
		});

		it("leaves the unscoped ceiling alone, so the scoped rule cannot collapse it", async () => {
			// A per-feature ceiling of 1 would have made this 1/min across ALL of a
			// student's courses, which is the mistake the scoped table exists to avoid.
			let allowed = 0;
			for (let i = 0; i < 12; i++) {
				if (await checkAiRateLimit("u1", "learningPathAI")) allowed++;
				else break;
			}

			expect(allowed).toBe(10);
		});
	});
};
