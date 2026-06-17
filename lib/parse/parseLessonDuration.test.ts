import { describe, expect, it } from "vitest";
import { parseLessonDuration } from "./parseLessonDuration";

describe("parseLessonDuration", () => {
	it("parses a bare number as minutes", () => {
		expect(parseLessonDuration("45")).toBe(45);
	});
	it("parses mm:ss as minutes (floor)", () => {
		expect(parseLessonDuration("15:30")).toBe(15);
	});
	it("parses '10 min' and '10 minutes'", () => {
		expect(parseLessonDuration("10 min")).toBe(10);
		expect(parseLessonDuration("10 minutes")).toBe(10);
	});
	it("parses '1h 30m' and '1.5 hours'", () => {
		expect(parseLessonDuration("1h 30m")).toBe(90);
		expect(parseLessonDuration("1.5 hours")).toBe(90);
	});
	it("returns null for unparseable or non-lesson-scale text", () => {
		expect(parseLessonDuration("1 week")).toBeNull();
		expect(parseLessonDuration("")).toBeNull();
		expect(parseLessonDuration(null)).toBeNull();
		expect(parseLessonDuration("soon")).toBeNull();
	});
});
