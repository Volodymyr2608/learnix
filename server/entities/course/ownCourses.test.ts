import { describe, expect, it } from "vitest";
import { getOwnCoursesInput } from "./ownCourses";

describe("getOwnCoursesInput", () => {
	it("applies defaults for an empty object", () => {
		expect(getOwnCoursesInput.parse({})).toEqual({
			status: "all",
			sort: "updated",
			page: 1,
		});
	});

	it("trims and caps q, and accepts valid enums", () => {
		const parsed = getOwnCoursesInput.parse({
			q: "  react  ",
			status: "draft",
			category: "development",
			sort: "students",
			page: 3,
		});
		expect(parsed).toEqual({
			q: "react",
			status: "draft",
			category: "development",
			sort: "students",
			page: 3,
		});
	});

	it("rejects an out-of-range page", () => {
		expect(() => getOwnCoursesInput.parse({ page: 0 })).toThrow();
	});

	it("rejects an unknown sort value", () => {
		expect(() => getOwnCoursesInput.parse({ sort: "bogus" })).toThrow();
	});
});
