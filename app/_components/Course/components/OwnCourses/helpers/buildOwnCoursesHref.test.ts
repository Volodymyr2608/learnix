import { describe, expect, it } from "vitest";
import { buildOwnCoursesHref } from "./buildOwnCoursesHref";

describe("buildOwnCoursesHref", () => {
	it("omits defaults and empties", () => {
		expect(
			buildOwnCoursesHref({
				q: "",
				status: "all",
				category: "all",
				sort: "updated",
				page: 1,
			}),
		).toBe("/instructor/courses");
	});

	it("includes only non-default params", () => {
		expect(
			buildOwnCoursesHref({
				q: "react",
				status: "draft",
				category: "design",
				sort: "title",
				page: 3,
			}),
		).toBe(
			"/instructor/courses?q=react&status=draft&category=design&sort=title&page=3",
		);
	});

	it("omits page 1 but keeps a filter", () => {
		expect(
			buildOwnCoursesHref({
				q: "",
				status: "published",
				category: "all",
				sort: "updated",
				page: 1,
			}),
		).toBe("/instructor/courses?status=published");
	});
});
