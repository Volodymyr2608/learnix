import { describe, expect, it } from "vitest";
import { parseStudentsSearchParams, toStudentsInput } from "./searchParams";

describe("parseStudentsSearchParams", () => {
	it("returns defaults for empty params", () => {
		expect(parseStudentsSearchParams({})).toEqual({
			q: "",
			status: "all",
			courseId: "all",
			sort: "recent",
			page: 1,
		});
	});

	it("reads valid params", () => {
		expect(
			parseStudentsSearchParams({
				q: "ann",
				status: "active",
				courseId: "cmpij5l68002o3mq0zvk65yzu",
				sort: "name",
				page: "3",
			}),
		).toEqual({
			q: "ann",
			status: "active",
			courseId: "cmpij5l68002o3mq0zvk65yzu",
			sort: "name",
			page: 3,
		});
	});

	it("falls back to defaults for invalid enum values", () => {
		const parsed = parseStudentsSearchParams({
			status: "bogus",
			sort: "bogus",
		});
		expect(parsed.status).toBe("all");
		expect(parsed.sort).toBe("recent");
	});

	it("coerces invalid or out-of-range page to 1", () => {
		expect(parseStudentsSearchParams({ page: "0" }).page).toBe(1);
		expect(parseStudentsSearchParams({ page: "-5" }).page).toBe(1);
		expect(parseStudentsSearchParams({ page: "abc" }).page).toBe(1);
	});

	it("takes the first value when a param is repeated", () => {
		expect(
			parseStudentsSearchParams({ status: ["completed", "active"] }).status,
		).toBe("completed");
	});
});

describe("toStudentsInput", () => {
	it("maps UI query to the tRPC input, dropping sentinel values", () => {
		expect(
			toStudentsInput({
				q: "  ann  ",
				status: "all",
				courseId: "all",
				sort: "recent",
				page: 1,
			}),
		).toEqual({
			q: "ann",
			status: "all",
			courseId: undefined,
			sort: "recent",
			page: 1,
		});
	});

	it("passes through a real courseId and trims empty search to undefined", () => {
		expect(
			toStudentsInput({
				q: "   ",
				status: "active",
				courseId: "cmpij5l68002o3mq0zvk65yzu",
				sort: "name",
				page: 2,
			}),
		).toEqual({
			q: undefined,
			status: "active",
			courseId: "cmpij5l68002o3mq0zvk65yzu",
			sort: "name",
			page: 2,
		});
	});
});
