import { describe, expect, it } from "vitest";
import {
	countLectures,
	countResources,
	type SectionStat,
	sumTotalDurationMinutes,
	sumVideoDurationMinutes,
} from "./courseStats";

const sections: SectionStat[] = [
	{
		lessons: [
			{
				durationMinutes: 30,
				videoUrl: "https://youtu.be/a",
				resources: [{ url: "x" }, { url: "y" }],
			},
			{ durationMinutes: 15, videoUrl: null, resources: null },
		],
	},
	{
		lessons: [
			{ durationMinutes: null, videoUrl: "https://youtu.be/b", resources: [] },
			{ durationMinutes: 60, videoUrl: "", resources: "not-an-array" },
		],
	},
];

describe("courseStats", () => {
	it("sums total duration ignoring nulls", () =>
		expect(sumTotalDurationMinutes(sections)).toBe(105));
	it("sums video duration only for lessons with a non-empty videoUrl", () =>
		expect(sumVideoDurationMinutes(sections)).toBe(30));
	it("counts all lectures across sections", () =>
		expect(countLectures(sections)).toBe(4));
	it("counts resources, tolerating null/non-array", () =>
		expect(countResources(sections)).toBe(2));
	it("handles empty input", () => {
		expect(sumTotalDurationMinutes([])).toBe(0);
		expect(countLectures([])).toBe(0);
		expect(countResources([])).toBe(0);
	});
});
