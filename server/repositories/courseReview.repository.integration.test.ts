import { describe, expect, it } from "vitest";
import { CourseStatus, Role } from "@/generated/prisma";
import { testDb } from "@/test/db";
import { makeCourse, makeUser } from "@/test/factories";
import { courseReviewRepository } from "./courseReview.repository";

async function makeReview(args: {
	courseId: string;
	studentId: string;
	rating: number;
	deletedAt?: Date | null;
}) {
	return testDb.courseReview.create({
		data: {
			courseId: args.courseId,
			studentId: args.studentId,
			rating: args.rating,
			comment: "ok",
			deletedAt: args.deletedAt ?? null,
		},
	});
}

describe("CourseReviewRepository.getAvgRatingByCourseIds", () => {
	it("averages non-deleted reviews per course", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: CourseStatus.published,
		});
		const s1 = await makeUser({ role: Role.STUDENT });
		const s2 = await makeUser({ role: Role.STUDENT });
		const s3 = await makeUser({ role: Role.STUDENT });
		await makeReview({ courseId: course.id, studentId: s1.id, rating: 5 });
		await makeReview({ courseId: course.id, studentId: s2.id, rating: 3 });
		await makeReview({
			courseId: course.id,
			studentId: s3.id,
			rating: 1,
			deletedAt: new Date(),
		});

		const map = await courseReviewRepository.getAvgRatingByCourseIds([
			course.id,
		]);
		expect(map.get(course.id)).toBe(4); // (5 + 3) / 2, deleted ignored
	});

	it("omits courses with no reviews", async () => {
		const map = await courseReviewRepository.getAvgRatingByCourseIds([
			"no-such-course",
		]);
		expect(map.has("no-such-course")).toBe(false);
	});
});