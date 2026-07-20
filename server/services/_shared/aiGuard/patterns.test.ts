import { describe, expect, it } from "vitest";
import { INJECTION_PATTERNS } from "./patterns";

describe("INJECTION_PATTERNS", () => {
	it("has unique rule ids", () => {
		const ids = INJECTION_PATTERNS.map((p) => p.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("gives every pattern a positive weight", () => {
		for (const p of INJECTION_PATTERNS) {
			expect(p.weight).toBeGreaterThan(0);
		}
	});

	it("never matches a bare topic keyword on its own", () => {
		// An instructor writing a course ABOUT the topic must not trip a rule
		// merely by naming it. This is the false-positive contract (AC-3).
		const descriptive =
			"This lesson explains prompt injection and jailbreak defenses.";
		const matched = INJECTION_PATTERNS.filter((p) => p.regex.test(descriptive));
		expect(matched).toEqual([]);
	});
});
