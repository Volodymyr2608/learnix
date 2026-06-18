import { describe, expect, it } from "vitest";
import {
	buildOwnCoursesHref,
	buildOwnCoursesQueryParams,
} from "./buildOwnCoursesHref";

describe("buildOwnCoursesQueryParams", () => {
	it("omits defaults and empties", () => {
		expect(
			buildOwnCoursesQueryParams({
				q: "",
				status: "all",
				category: "all",
				sort: "updated",
				page: 1,
			}),
		).toEqual({});
	});

	it("includes only non-default params, excluding page", () => {
		expect(
			buildOwnCoursesQueryParams({
				q: "react",
				status: "draft",
				category: "design",
				sort: "title",
				page: 3,
			}),
		).toEqual({ q: "react", status: "draft", category: "design", sort: "title" });
	});
});

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
