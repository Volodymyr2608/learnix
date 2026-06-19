import { describe, expect, it } from "vitest";
import { ReviewTag } from "@/generated/prisma";
import { createReviewInput } from "./review.dto";

describe("createReviewInput", () => {
	const valid = {
		courseId: "course_1",
		rating: 5,
		comment: "x".repeat(50),
		tags: [ReviewTag.PACE],
	};

	it("accepts a valid payload", () => {
		expect(createReviewInput.parse(valid)).toEqual(valid);
	});

	it("defaults tags to an empty array when omitted", () => {
		const { tags, ...withoutTags } = valid;
		expect(createReviewInput.parse(withoutTags).tags).toEqual([]);
	});

	it("rejects rating outside 1..5", () => {
		expect(() => createReviewInput.parse({ ...valid, rating: 0 })).toThrow();
		expect(() => createReviewInput.parse({ ...valid, rating: 6 })).toThrow();
	});

	it("rejects a non-integer rating", () => {
		expect(() => createReviewInput.parse({ ...valid, rating: 4.5 })).toThrow();
	});

	it("rejects a comment shorter than 50 characters", () => {
		expect(() =>
			createReviewInput.parse({ ...valid, comment: "too short" }),
		).toThrow();
	});

	it("rejects an unknown tag", () => {
		expect(() =>
			createReviewInput.parse({ ...valid, tags: ["NOT_A_TAG"] }),
		).toThrow();
	});
});
