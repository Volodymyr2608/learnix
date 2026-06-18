import { describe, expect, it } from "vitest";
import { formatDuration } from "./formatDuration";

describe("formatDuration", () => {
	it("formats minutes under an hour", () => {
		expect(formatDuration(45)).toBe("45 min");
	});
	it("formats whole hours", () => {
		expect(formatDuration(120)).toBe("2h");
	});
	it("formats hours and minutes", () => {
		expect(formatDuration(90)).toBe("1h 30m");
	});
	it("treats null/unknown/zero as a dash", () => {
		expect(formatDuration(null)).toBe("—");
		expect(formatDuration(0)).toBe("—");
		expect(formatDuration(undefined)).toBe("—");
	});
});
