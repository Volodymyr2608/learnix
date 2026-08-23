import { describe, expect, it } from "vitest";
import { ruleIdentity } from "./identity";

describe("ruleIdentity", () => {
	it("strips a language prefix so variants of one rule share an identity", () => {
		expect(ruleIdentity("en:override-ignore-prior")).toBe(
			"override-ignore-prior",
		);
		expect(ruleIdentity("es:override-ignore-prior")).toBe(
			"override-ignore-prior",
		);
		expect(ruleIdentity("fr:override-ignore-prior")).toBe(
			"override-ignore-prior",
		);
		expect(ruleIdentity("de:override-ignore-prior")).toBe(
			"override-ignore-prior",
		);
	});

	it("leaves a universal id untouched — it is its own identity", () => {
		expect(ruleIdentity("markup-fake-tokens")).toBe("markup-fake-tokens");
		expect(ruleIdentity("jailbreak-dan-token")).toBe("jailbreak-dan-token");
	});

	it("strips only a leading prefix, never one appearing mid-id", () => {
		expect(ruleIdentity("leak-en:not-a-prefix")).toBe("leak-en:not-a-prefix");
	});
});
