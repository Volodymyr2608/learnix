import { beforeEach, describe, expect, it } from "vitest";
import { truncateAll } from "@/test/db";
import { makeCourse, makeEnrollment, makeUser } from "@/test/factories";
import { enrollmentRepository } from "./enrollment.repository";

describe("enrollmentRepository.findAnyEnrollmentCourseIds (REC)", () => {
	beforeEach(async () => {
		await truncateAll();
	});

	it("returns active, completed and cancelled enrollments' courses", async () => {
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		const student = await makeUser();
		const ids: string[] = [];
		for (const status of ["active", "completed", "cancelled"] as const) {
			const course = await makeCourse({ instructorId: instructor.id });
			await makeEnrollment({
				studentId: student.id,
				courseId: course.id,
				status,
			});
			ids.push(course.id);
		}

		expect(
			(
				await enrollmentRepository.findAnyEnrollmentCourseIds(student.id)
			).sort(),
		).toEqual(ids.sort());
	});
});
