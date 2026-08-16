import { describe, expect, it } from "vitest";
import { checkAiRateLimit, validateMessageLength } from "./aiRateLimiter";

describe("checkAiRateLimit", () => {
	// One bucket keyed on userId alone covered all three chat routes, so using the
	// tutor consumed the same account's course-builder allowance.
	it("does not let one feature consume another's allowance", () => {
		const userId = `user-${Math.random()}`;

		for (let i = 0; i < 20; i++) {
			expect(checkAiRateLimit(userId, "lessonAI")).toBe(true);
		}

		expect(checkAiRateLimit(userId, "lessonAI")).toBe(false);
		expect(checkAiRateLimit(userId, "courseAI")).toBe(true);
	});

	it("keeps separate users separate within the same feature", () => {
		const a = `user-${Math.random()}`;
		const b = `user-${Math.random()}`;

		for (let i = 0; i < 20; i++) checkAiRateLimit(a, "lessonAI");

		expect(checkAiRateLimit(a, "lessonAI")).toBe(false);
		expect(checkAiRateLimit(b, "lessonAI")).toBe(true);
	});
});

describe("validateMessageLength", () => {
	it("caps at 2000 characters", () => {
		expect(validateMessageLength("x".repeat(2_000))).toBe(true);
		expect(validateMessageLength("x".repeat(2_001))).toBe(false);
	});
});
