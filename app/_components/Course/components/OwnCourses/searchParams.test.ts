import { describe, expect, it } from "vitest";
import { parseOwnCoursesSearchParams, toSearchInput } from "./searchParams";

describe("parseOwnCoursesSearchParams", () => {
	it("returns defaults for empty params", () => {
		expect(parseOwnCoursesSearchParams({})).toEqual({
			q: "",
			status: "all",
			category: "all",
			sort: "updated",
			page: 1,
		});
	});

	it("reads valid params", () => {
		expect(
			parseOwnCoursesSearchParams({
				q: "react",
				status: "draft",
				category: "development",
				sort: "title",
				page: "2",
			}),
		).toEqual({
			q: "react",
			status: "draft",
			category: "development",
			sort: "title",
			page: 2,
		});
	});

	it("falls back to defaults for invalid enum values", () => {
		const parsed = parseOwnCoursesSearchParams({
			status: "bogus",
			sort: "bogus",
		});
		expect(parsed.status).toBe("all");
		expect(parsed.sort).toBe("updated");
	});

	it("coerces invalid or out-of-range page to 1", () => {
		expect(parseOwnCoursesSearchParams({ page: "0" }).page).toBe(1);
		expect(parseOwnCoursesSearchParams({ page: "-5" }).page).toBe(1);
		expect(parseOwnCoursesSearchParams({ page: "abc" }).page).toBe(1);
	});

	it("takes the first value when a param is repeated", () => {
		expect(
			parseOwnCoursesSearchParams({ status: ["draft", "published"] }).status,
		).toBe("draft");
	});
});

describe("toSearchInput", () => {
	it("drops sentinel/empty values", () => {
		expect(
			toSearchInput({
				q: "  ",
				status: "all",
				category: "all",
				sort: "updated",
				page: 1,
			}),
		).toEqual({
			q: undefined,
			status: "all",
			category: undefined,
			sort: "updated",
			page: 1,
		});
	});

	it("passes through real values, trimming q", () => {
		expect(
			toSearchInput({
				q: "  react ",
				status: "draft",
				category: "design",
				sort: "title",
				page: 2,
			}),
		).toEqual({
			q: "react",
			status: "draft",
			category: "design",
			sort: "title",
			page: 2,
		});
	});
});
