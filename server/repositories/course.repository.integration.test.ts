import { describe, expect, it } from "vitest";
import { CourseStatus, EnrollmentStatus, Role } from "@/generated/prisma";
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