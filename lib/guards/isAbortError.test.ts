import { describe, expect, it } from "vitest";
import { isAbortError } from "./isAbortError";

describe("isAbortError", () => {
	it("returns true for an object with name AbortError", () => {
		expect(isAbortError({ name: "AbortError" })).toBe(true);
	});
	it("returns false for other errors and non-objects", () => {
		expect(isAbortError(new Error("nope"))).toBe(false);
		expect(isAbortError(null)).toBe(false);
		expect(isAbortError("AbortError")).toBe(false);
	});
});