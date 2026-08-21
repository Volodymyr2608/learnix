import { describe, expect, it } from "vitest";
import type { InjectionPattern } from "./patterns";
import {
	BLOCK_THRESHOLD,
	INJECTION_PATTERNS,
	RULE_ID_VOCABULARY,
	ruleIdentity,
} from "./patterns";

const byIdentity = (): Map<string, InjectionPattern[]> => {
	const groups = new Map<string, InjectionPattern[]>();
	for (const pattern of INJECTION_PATTERNS) {
		const key = ruleIdentity(pattern.id);
		groups.set(key, [...(groups.get(key) ?? []), pattern]);
	}
	return groups;
};

describe("rule-id vocabulary (S5 / AC-9)", () => {
	it("has unique ids", () => {
		expect(new Set(RULE_ID_VOCABULARY).size).toBe(RULE_ID_VOCABULARY.length);
	});

	it("declares exactly the ids the patterns carry", () => {
		expect(new Set(INJECTION_PATTERNS.map((p) => p.id))).toEqual(
			new Set(RULE_ID_VOCABULARY),
		);
	});

	it("gives every pattern a positive weight", () => {
		for (const pattern of INJECTION_PATTERNS) {
			expect(pattern.weight).toBeGreaterThan(0);
		}
	});
});

describe("scope partition is exhaustive (AC-8)", () => {
	it("classifies every rule as either language-scoped or universal, with no overlap", () => {
		const scoped = INJECTION_PATTERNS.filter((p) => p.lang !== "universal");
		const universal = INJECTION_PATTERNS.filter((p) => p.lang === "universal");

		expect(scoped.length + universal.length).toBe(INJECTION_PATTERNS.length);
		expect(scoped.filter((p) => universal.some((u) => u.id === p.id))).toEqual(
			[],
		);
	});

	it("prefixes every language-scoped id with its language and leaves universal ids bare", () => {
		for (const pattern of INJECTION_PATTERNS) {
			if (pattern.lang === "universal") {
				expect(pattern.id).toBe(ruleIdentity(pattern.id));
			} else {
				expect(pattern.id.startsWith(`${pattern.lang}:`)).toBe(true);
			}
		}
	});
});

describe("weight and category parity across an identity's variants (AC-5)", () => {
	it("keeps every translated variant at its English counterpart's weight and category", () => {
		for (const [identity, group] of byIdentity()) {
			if (group.length < 2) continue;
			expect(
				new Set(group.map((p) => p.weight)).size,
				`weights diverge for ${identity}`,
			).toBe(1);
			expect(
				new Set(group.map((p) => p.category)).size,
				`categories diverge for ${identity}`,
			).toBe(1);
		}
	});

	it("keeps every newly authored rule below BLOCK_THRESHOLD", () => {
		// The only rules permitted at or above the threshold are the pre-existing
		// structural ones and DAN, whose weights this feature did not choose.
		const PRE_EXISTING_AT_THRESHOLD = new Set([
			"markup-fake-tokens",
			"markup-injected-tags",
			"jailbreak-dan-token",
			"en:jailbreak-dan-prose",
		]);
		for (const pattern of INJECTION_PATTERNS) {
			if (pattern.weight >= BLOCK_THRESHOLD) {
				expect(PRE_EXISTING_AT_THRESHOLD).toContain(pattern.id);
			}
		}
	});
});

describe("false-positive contract", () => {
	it("never matches a bare topic keyword on its own", () => {
		// An instructor writing a course ABOUT the topic must not trip a rule
		// merely by naming it.
		const descriptive =
			"This lesson explains prompt injection and jailbreak defenses.";
		expect(
			INJECTION_PATTERNS.filter((p) => p.regex.test(descriptive)).map(
				(p) => p.id,
			),
		).toEqual([]);
	});
});
