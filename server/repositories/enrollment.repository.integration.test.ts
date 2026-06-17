import { describe, expect, it } from "vitest";
import { CourseStatus, EnrollmentStatus, Role } from "@/generated/prisma";
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

describe("EnrollmentRepository.findInstructorStudents", () => {
	const cutoff = new Date("2026-06-09T00:00:00Z"); // "now" - 7 days for these fixtures

	it("aggregates one row per student with this instructor's courses only", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const other = await makeUser({ role: Role.INSTRUCTOR });
		const c1 = await makeCourse({
			instructorId: instructor.id,
			title: "Course One",
			status: CourseStatus.published,
		});
		const foreign = await makeCourse({
			instructorId: other.id,
			title: "Foreign",
			status: CourseStatus.published,
		});
		const student = await makeUser({ role: Role.STUDENT, name: "Aaa Student" });
		await makeEnrollment({
			studentId: student.id,
			courseId: c1.id,
			progress: 40,
			enrolledAt: new Date("2026-06-10T00:00:00Z"),
			lastAccessedAt: new Date("2026-06-15T00:00:00Z"),
		});
		await makeEnrollment({
			studentId: student.id,
			courseId: foreign.id,
			progress: 100,
		});

		const { rows, total } = await enrollmentRepository.findInstructorStudents({
			instructorId: instructor.id,
			cutoff,
			status: "all",
			sort: "recent",
			page: 1,
			perPage: 10,
		});

		expect(total).toBe(1);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			id: student.id,
			name: "Aaa Student",
			progress: 40,
			status: "active",
		});
		expect(rows[0]?.courses).toHaveLength(1); // foreign course excluded
		expect(rows[0]?.courses[0]).toMatchObject({
			title: "Course One",
			progress: 40,
		});
	});

	it("derives completed and inactive statuses", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: CourseStatus.published,
		});
		const done = await makeUser({ role: Role.STUDENT, name: "Done" });
		const stale = await makeUser({ role: Role.STUDENT, name: "Stale" });
		await makeEnrollment({
			studentId: done.id,
			courseId: course.id,
			status: EnrollmentStatus.completed,
			progress: 100,
			lastAccessedAt: new Date("2026-06-15T00:00:00Z"),
		});
		await makeEnrollment({
			studentId: stale.id,
			courseId: course.id,
			progress: 20,
			lastAccessedAt: new Date("2026-05-01T00:00:00Z"), // older than cutoff
		});

		const { rows } = await enrollmentRepository.findInstructorStudents({
			instructorId: instructor.id,
			cutoff,
			status: "all",
			sort: "name",
			page: 1,
			perPage: 10,
		});

		const byName = Object.fromEntries(rows.map((r) => [r.name, r.status]));
		expect(byName.Done).toBe("completed");
		expect(byName.Stale).toBe("inactive");
	});

	it("filters by status and excludes cancelled-only students", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: CourseStatus.published,
		});
		const cancelled = await makeUser({ role: Role.STUDENT, name: "Gone" });
		await makeEnrollment({
			studentId: cancelled.id,
			courseId: course.id,
			status: EnrollmentStatus.cancelled,
		});

		const { rows, total } = await enrollmentRepository.findInstructorStudents({
			instructorId: instructor.id,
			cutoff,
			status: "active",
			sort: "recent",
			page: 1,
			perPage: 10,
		});

		expect(total).toBe(0);
		expect(rows).toHaveLength(0);
	});
});
