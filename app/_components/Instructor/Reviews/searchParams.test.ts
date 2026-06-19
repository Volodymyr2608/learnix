import { describe, expect, it } from "vitest";
import {
	parseReviewsSearchParams,
	toReviewsInput,
	toStatsInput,
} from "./searchParams";

describe("parseReviewsSearchParams", () => {
	it("returns defaults for empty params", () => {
		expect(parseReviewsSearchParams({})).toEqual({
			courseId: "all",
			rating: "all",
			page: 1,
		});
	});

	it("reads valid params", () => {
		expect(
			parseReviewsSearchParams({
				courseId: "cmpij5l68002o3mq0zvk65yzu",
				rating: "4",
				page: "3",
			}),
		).toEqual({
			courseId: "cmpij5l68002o3mq0zvk65yzu",
			rating: "4",
			page: 3,
		});
	});

	it("falls back to 'all' for an out-of-range rating", () => {
		expect(parseReviewsSearchParams({ rating: "9" }).rating).toBe("all");
		expect(parseReviewsSearchParams({ rating: "bogus" }).rating).toBe("all");
	});

	it("coerces invalid or out-of-range page to 1", () => {
		expect(parseReviewsSearchParams({ page: "0" }).page).toBe(1);
		expect(parseReviewsSearchParams({ page: "-5" }).page).toBe(1);
		expect(parseReviewsSearchParams({ page: "abc" }).page).toBe(1);
	});

	it("takes the first value when a param is repeated", () => {
		expect(parseReviewsSearchParams({ rating: ["5", "4"] }).rating).toBe("5");
	});
});

describe("toStatsInput", () => {
	it("carries courseId only, dropping the 'all' sentinel", () => {
		expect(toStatsInput({ courseId: "all", rating: "5", page: 2 })).toEqual({});
		expect(toStatsInput({ courseId: "c1", rating: "5", page: 2 })).toEqual({
			courseId: "c1",
		});
	});
});

describe("toReviewsInput", () => {
	it("maps rating to a number and drops 'all' sentinels", () => {
		expect(toReviewsInput({ courseId: "all", rating: "all", page: 1 })).toEqual(
			{ page: 1 },
		);
		expect(toReviewsInput({ courseId: "c1", rating: "4", page: 2 })).toEqual({
			courseId: "c1",
			rating: 4,
			page: 2,
		});
	});
});
