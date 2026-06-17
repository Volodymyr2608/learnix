import { describe, expect, it } from "vitest";
import { formatLastActive, getInitials, statusBadgeClass } from "./utils";

describe("Students utils", () => {
	it("builds uppercase initials from a name", () => {
		expect(getInitials("Sarah Johnson")).toBe("SJ");
		expect(getInitials("madonna")).toBe("M");
	});

	it("returns 'Never' for a null last-active date", () => {
		expect(formatLastActive(null)).toBe("Never");
	});

	it("returns a relative string for a real date", () => {
		const result = formatLastActive(new Date(Date.now() - 1000 * 60 * 60));
		expect(result).toMatch(/ago/);
	});

	it("maps each status to a non-empty class string", () => {
		expect(statusBadgeClass("active")).toContain("green");
		expect(statusBadgeClass("completed")).toContain("blue");
		expect(statusBadgeClass("inactive")).toContain("gray");
	});
});
