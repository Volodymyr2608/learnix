import { describe, expect, it } from "vitest";
import { CourseStatus, EnrollmentStatus, Role } from "@/generated/prisma";
import { testDb } from "@/test/db";
import { makeCourse, makeEnrollment, makeUser } from "@/test/factories";
import { courseRepository } from "./course.repository";

describe("CourseRepository.getCourseCardsByIds", () => {
	it("returns title and active-student count, scoped to the instructor", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const other = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({
			instructorId: instructor.id,
			title: "Owned Course",
			status: CourseStatus.published,
		});
		const foreign = await makeCourse({
			instructorId: other.id,
			status: CourseStatus.published,
		});

		const s1 = await makeUser({ role: Role.STUDENT });
		const s2 = await makeUser({ role: Role.STUDENT });
		const s3 = await makeUser({ role: Role.STUDENT });
		await makeEnrollment({ studentId: s1.id, courseId: course.id });
		await makeEnrollment({ studentId: s2.id, courseId: course.id });
		await makeEnrollment({
			studentId: s3.id,
			courseId: course.id,
			status: EnrollmentStatus.cancelled,
		});

		const map = await courseRepository.getCourseCardsByIds(instructor.id, [
			course.id,
			foreign.id,
		]);

		expect(map.get(course.id)).toEqual({ title: "Owned Course", students: 2 });
		expect(map.has(foreign.id)).toBe(false); // not owned by instructor
	});

	it("returns an empty map for no ids", async () => {
		const map = await courseRepository.getCourseCardsByIds("x", []);
		expect(map.size).toBe(0);
	});
});

describe("CourseRepository.searchOwnCourses", () => {
	it("scopes to the instructor, excludes soft-deleted, and paginates", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const other = await makeUser({ role: Role.INSTRUCTOR });
		for (let i = 0; i < 10; i++) {
			await makeCourse({ instructorId: instructor.id, title: `Owned ${i}` });
		}
		await makeCourse({
			instructorId: instructor.id,
			title: "Gone",
			deletedAt: new Date(),
		});
		await makeCourse({ instructorId: other.id, title: "Foreign" });

		const page1 = await courseRepository.searchOwnCourses({
			instructorId: instructor.id,
			status: "all",
			sort: "updated",
			page: 1,
		});
		expect(page1.total).toBe(10);
		expect(page1.data).toHaveLength(9);
		expect(page1.lastPage).toBe(2);
		expect(page1.perPage).toBe(9);
		expect(page1.data.every((c) => c.title.startsWith("Owned"))).toBe(true);

		const page2 = await courseRepository.searchOwnCourses({
			instructorId: instructor.id,
			status: "all",
			sort: "updated",
			page: 2,
		});
		expect(page2.data).toHaveLength(1);
		expect(page2.currentPage).toBe(2);
	});

	it("filters by status", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		await makeCourse({
			instructorId: instructor.id,
			status: CourseStatus.draft,
		});
		await makeCourse({
			instructorId: instructor.id,
			status: CourseStatus.published,
		});

		const drafts = await courseRepository.searchOwnCourses({
			instructorId: instructor.id,
			status: "draft",
			sort: "updated",
			page: 1,
		});
		expect(drafts.total).toBe(1);
		expect(drafts.data[0]?.status).toBe(CourseStatus.draft);
	});

	it("filters by category case-insensitively", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		await makeCourse({ instructorId: instructor.id, category: "Development" });
		await makeCourse({ instructorId: instructor.id, category: "Design" });

		const dev = await courseRepository.searchOwnCourses({
			instructorId: instructor.id,
			status: "all",
			category: "development",
			sort: "updated",
			page: 1,
		});
		expect(dev.total).toBe(1);
	});

	it("filters by a multi-word category slug", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		await makeCourse({ instructorId: instructor.id, category: "data-science" });
		await makeCourse({ instructorId: instructor.id, category: "Design" });

		const dataScience = await courseRepository.searchOwnCourses({
			instructorId: instructor.id,
			status: "all",
			category: "data-science",
			sort: "updated",
			page: 1,
		});
		expect(dataScience.total).toBe(1);
	});

	it("searches title, subtitle, and description", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		await makeCourse({ instructorId: instructor.id, title: "Intro to Rust" });
		await makeCourse({
			instructorId: instructor.id,
			title: "Other",
			subtitle: "All about Rust internals",
		});
		await makeCourse({
			instructorId: instructor.id,
			title: "Other 2",
			description: "covers rust deeply",
		});
		await makeCourse({ instructorId: instructor.id, title: "Python" });

		const res = await courseRepository.searchOwnCourses({
			instructorId: instructor.id,
			q: "rust",
			status: "all",
			sort: "updated",
			page: 1,
		});
		expect(res.total).toBe(3);
	});

	it("sorts by title A-Z", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		await makeCourse({ instructorId: instructor.id, title: "Zebra" });
		await makeCourse({ instructorId: instructor.id, title: "Apple" });

		const res = await courseRepository.searchOwnCourses({
			instructorId: instructor.id,
			status: "all",
			sort: "title",
			page: 1,
		});
		expect(res.data.map((c) => c.title)).toEqual(["Apple", "Zebra"]);
	});

	it("sorts by most students", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const few = await makeCourse({ instructorId: instructor.id, title: "Few" });
		const many = await makeCourse({
			instructorId: instructor.id,
			title: "Many",
		});
		const s1 = await makeUser({ role: Role.STUDENT });
		const s2 = await makeUser({ role: Role.STUDENT });
		await makeEnrollment({ studentId: s1.id, courseId: many.id });
		await makeEnrollment({ studentId: s2.id, courseId: many.id });
		await makeEnrollment({ studentId: s1.id, courseId: few.id });

		const res = await courseRepository.searchOwnCourses({
			instructorId: instructor.id,
			status: "all",
			sort: "students",
			page: 1,
		});
		expect(res.data[0]?.title).toBe("Many");
	});
});

describe("CourseRepository.getPublishedCourses ratings", () => {
	it("returns the average rating for courses with reviews and null otherwise", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const rated = await makeCourse({
			instructorId: instructor.id,
			status: CourseStatus.published,
		});
		const unrated = await makeCourse({
			instructorId: instructor.id,
			status: CourseStatus.published,
		});
		const s1 = await makeUser({ role: Role.STUDENT });
		const s2 = await makeUser({ role: Role.STUDENT });
		await testDb.courseReview.create({
			data: { courseId: rated.id, studentId: s1.id, rating: 4, comment: "ok" },
		});
		await testDb.courseReview.create({
			data: { courseId: rated.id, studentId: s2.id, rating: 2, comment: "ok" },
		});

		const { courses } = await courseRepository.getPublishedCourses({});
		const byId = new Map(courses.map((c) => [c.id, c.rating]));

		expect(byId.get(rated.id)).toBe(3);
		expect(byId.get(unrated.id)).toBeNull();
	});
});
