import { describe, expect, it } from "vitest";
import { capitalize } from "./capitalize";

describe("capitalize", () => {
	it("uppercases the first character", () => {
		expect(capitalize("hello")).toBe("Hello");
	});
	it("returns empty string for null/undefined/empty", () => {
		expect(capitalize(null)).toBe("");
		expect(capitalize(undefined)).toBe("");
		expect(capitalize("")).toBe("");
	});
	it("leaves an already-capitalized string unchanged", () => {
		expect(capitalize("World")).toBe("World");
	});
});
