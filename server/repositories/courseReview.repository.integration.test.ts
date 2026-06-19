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

describe("CourseReviewRepository.findRecentByInstructor", () => {
	it("returns newest-first reviews scoped to the instructor", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({
			instructorId: instructor.id,
			title: "Reviewed Course",
			status: CourseStatus.published,
		});
		const s1 = await makeUser({ role: Role.STUDENT, name: "Reviewer One" });
		const s2 = await makeUser({ role: Role.STUDENT, name: "Reviewer Two" });
		await makeReview({ courseId: course.id, studentId: s1.id, rating: 4 });
		await makeReview({ courseId: course.id, studentId: s2.id, rating: 5 });

		const rows = await courseReviewRepository.findRecentByInstructor(
			instructor.id,
			5,
		);

		expect(rows.length).toBe(2);
		expect(rows[0]).toMatchObject({ courseTitle: "Reviewed Course" });
		expect(typeof rows[0]?.rating).toBe("number");
		expect(typeof rows[0]?.studentName).toBe("string");
	});
});

describe("CourseReviewRepository.getInstructorReviewStats", () => {
	it("aggregates rating, total, five-star and low-rating counts per instructor", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: CourseStatus.published,
		});
		const s1 = await makeUser({ role: Role.STUDENT });
		const s2 = await makeUser({ role: Role.STUDENT });
		const s3 = await makeUser({ role: Role.STUDENT });
		const s4 = await makeUser({ role: Role.STUDENT });
		await makeReview({ courseId: course.id, studentId: s1.id, rating: 5 });
		await makeReview({ courseId: course.id, studentId: s2.id, rating: 5 });
		await makeReview({ courseId: course.id, studentId: s3.id, rating: 2 });
		await makeReview({ courseId: course.id, studentId: s4.id, rating: 1 });

		const stats = await courseReviewRepository.getInstructorReviewStats(
			instructor.id,
		);

		expect(stats.total).toBe(4);
		expect(stats.average).toBeCloseTo((5 + 5 + 2 + 1) / 4);
		expect(stats.fiveStarCount).toBe(2);
		expect(stats.lowRatingCount).toBe(2);
		expect(stats.perStar.get(5)).toBe(2);
	});

	it("scopes to a single course when courseId is given and excludes other instructors", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const otherInstructor = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: CourseStatus.published,
		});
		const secondCourse = await makeCourse({
			instructorId: instructor.id,
			status: CourseStatus.published,
		});
		const otherCourse = await makeCourse({
			instructorId: otherInstructor.id,
			status: CourseStatus.published,
		});
		const s1 = await makeUser({ role: Role.STUDENT });
		const s2 = await makeUser({ role: Role.STUDENT });
		const s3 = await makeUser({ role: Role.STUDENT });
		await makeReview({ courseId: course.id, studentId: s1.id, rating: 4 });
		await makeReview({
			courseId: secondCourse.id,
			studentId: s2.id,
			rating: 1,
		});
		await makeReview({ courseId: otherCourse.id, studentId: s3.id, rating: 1 });

		const scoped = await courseReviewRepository.getInstructorReviewStats(
			instructor.id,
			course.id,
		);
		expect(scoped.total).toBe(1);
		expect(scoped.average).toBe(4);

		const all = await courseReviewRepository.getInstructorReviewStats(
			instructor.id,
		);
		expect(all.total).toBe(2);
	});

	it("returns a null average with zero reviews", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const stats = await courseReviewRepository.getInstructorReviewStats(
			instructor.id,
		);
		expect(stats.total).toBe(0);
		expect(stats.average).toBeNull();
	});
});

describe("CourseReviewRepository.findInstructorReviews", () => {
	it("returns newest-first, paginated rows with student + course fields, filtered by rating", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({
			instructorId: instructor.id,
			title: "Filtered Course",
			status: CourseStatus.published,
		});
		const s1 = await makeUser({ role: Role.STUDENT, name: "Old Reviewer" });
		const s2 = await makeUser({ role: Role.STUDENT, name: "Mid Reviewer" });
		const s3 = await makeUser({ role: Role.STUDENT, name: "New Reviewer" });
		await testDb.courseReview.create({
			data: {
				courseId: course.id,
				studentId: s1.id,
				rating: 5,
				comment: "old",
				createdAt: new Date("2025-01-01"),
			},
		});
		await testDb.courseReview.create({
			data: {
				courseId: course.id,
				studentId: s2.id,
				rating: 3,
				comment: "mid",
				createdAt: new Date("2025-02-01"),
			},
		});
		await testDb.courseReview.create({
			data: {
				courseId: course.id,
				studentId: s3.id,
				rating: 5,
				comment: "new",
				createdAt: new Date("2025-03-01"),
			},
		});

		const all = await courseReviewRepository.findInstructorReviews({
			instructorId: instructor.id,
			page: 1,
			perPage: 10,
		});
		expect(all.total).toBe(3);
		expect(all.rows[0]?.comment).toBe("new");
		expect(all.rows[0]).toMatchObject({
			courseTitle: "Filtered Course",
			studentName: "New Reviewer",
		});

		const fiveStar = await courseReviewRepository.findInstructorReviews({
			instructorId: instructor.id,
			rating: 5,
			page: 1,
			perPage: 10,
		});
		expect(fiveStar.total).toBe(2);
		expect(fiveStar.rows.every((r) => r.rating === 5)).toBe(true);

		const pageTwo = await courseReviewRepository.findInstructorReviews({
			instructorId: instructor.id,
			page: 2,
			perPage: 2,
		});
		expect(pageTwo.rows).toHaveLength(1);
		expect(pageTwo.total).toBe(3);
	});
});

describe("CourseReviewRepository.getInstructorReviewCourseOptions", () => {
	it("returns one entry per owned course that has at least one review", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({
			instructorId: instructor.id,
			title: "Reviewed",
			status: CourseStatus.published,
		});
		await makeCourse({
			instructorId: instructor.id,
			title: "Unreviewed",
			status: CourseStatus.published,
		});
		const s1 = await makeUser({ role: Role.STUDENT });
		const s2 = await makeUser({ role: Role.STUDENT });
		await makeReview({ courseId: course.id, studentId: s1.id, rating: 5 });
		await makeReview({ courseId: course.id, studentId: s2.id, rating: 4 });

		const options =
			await courseReviewRepository.getInstructorReviewCourseOptions(
				instructor.id,
			);

		expect(options).toHaveLength(1);
		expect(options[0]).toMatchObject({ id: course.id, title: "Reviewed" });
	});
});

describe("CourseReviewRepository.findByStudentAndCourse", () => {
	it("returns the active review for a student/course pair", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: CourseStatus.published,
		});
		const student = await makeUser({ role: Role.STUDENT });
		await makeReview({ courseId: course.id, studentId: student.id, rating: 4 });

		const found = await courseReviewRepository.findByStudentAndCourse(
			student.id,
			course.id,
		);

		expect(found?.rating).toBe(4);
	});

	it("ignores soft-deleted reviews", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: CourseStatus.published,
		});
		const student = await makeUser({ role: Role.STUDENT });
		await makeReview({
			courseId: course.id,
			studentId: student.id,
			rating: 4,
			deletedAt: new Date(),
		});

		const found = await courseReviewRepository.findByStudentAndCourse(
			student.id,
			course.id,
		);

		expect(found).toBeNull();
	});
});
