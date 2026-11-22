import { beforeEach, describe, expect, it } from "vitest";
import { courseReviewRepository } from "@/server/repositories/courseReview.repository";
import { testDb, truncateAll } from "@/test/db";
import {
	makeCourse,
	makeCourseReview,
	makeEnrollment,
	makeUser,
} from "@/test/factories";
import { reviewService } from "./review.service";

describe("a review hidden by a refund is restored on re-review (E2-R, FR-P13)", () => {
	let studentId: string;
	let courseId: string;

	beforeEach(async () => {
		await truncateAll();
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		studentId = (await makeUser()).id;
		courseId = (
			await makeCourse({ instructorId: instructor.id, status: "published" })
		).id;
		await makeEnrollment({
			studentId,
			courseId,
			status: "completed",
			completedAt: new Date(),
		});
	});

	it("restores the hidden row with the new rating and comment instead of conflicting", async () => {
		const hidden = await makeCourseReview({
			studentId,
			courseId,
			rating: 1,
			comment: "Old text",
			deletedAt: new Date(),
		});

		const { id } = await reviewService.createReview(studentId, {
			courseId,
			rating: 5,
			comment: "Much better the second time",
			tags: [],
		});

		expect(id).toBe(hidden.id);
		const row = await testDb.courseReview.findUniqueOrThrow({ where: { id } });
		expect(row).toMatchObject({
			rating: 5,
			comment: "Much better the second time",
			deletedAt: null,
		});
		expect(await testDb.courseReview.count()).toBe(1);
		const avg = await courseReviewRepository.getAvgRatingByCourseIds([
			courseId,
		]);
		expect(avg.get(courseId)).toBe(5);
	});
});
