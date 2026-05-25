import { describe, expect, it } from "vitest";
import { doesPasswordMatch } from "./doesPasswordMatch";

describe("doesPasswordMatch", () => {
	it("returns true when passwords are identical", () => {
		expect(doesPasswordMatch({ password: "abc", confirmPassword: "abc" })).toBe(
			true,
		);
	});
	it("returns false when passwords differ", () => {
		expect(doesPasswordMatch({ password: "abc", confirmPassword: "abd" })).toBe(
			false,
		);
	});
});
