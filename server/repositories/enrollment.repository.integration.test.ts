import { describe, expect, it } from "vitest";
import { CourseStatus, Role } from "@/generated/prisma";
import { makeCourse, makeEnrollment, makeUser } from "@/test/factories";
import { enrollmentRepository } from "./enrollment.repository";

describe("EnrollmentRepository.findRecentByInstructor", () => {
	it("returns newest-first rows with student name and course title", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({
			instructorId: instructor.id,
			title: "My Course",
			status: CourseStatus.published,
		});
		const older = await makeUser({ role: Role.STUDENT, name: "Older Student" });
		const newer = await makeUser({ role: Role.STUDENT, name: "Newer Student" });
		await makeEnrollment({
			studentId: older.id,
			courseId: course.id,
			enrolledAt: new Date("2026-01-01T00:00:00Z"),
		});
		await makeEnrollment({
			studentId: newer.id,
			courseId: course.id,
			enrolledAt: new Date("2026-02-01T00:00:00Z"),
		});

		const rows = await enrollmentRepository.findRecentByInstructor(
			instructor.id,
			5,
		);

		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({
			studentName: "Newer Student",
			courseTitle: "My Course",
		});
		expect(rows[1]?.studentName).toBe("Older Student");
	});

	it("excludes other instructors' enrollments", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const other = await makeUser({ role: Role.INSTRUCTOR });
		const foreign = await makeCourse({
			instructorId: other.id,
			status: CourseStatus.published,
		});
		const student = await makeUser({ role: Role.STUDENT });
		await makeEnrollment({ studentId: student.id, courseId: foreign.id });

		const rows = await enrollmentRepository.findRecentByInstructor(
			instructor.id,
			5,
		);
		expect(rows).toHaveLength(0);
	});
});
