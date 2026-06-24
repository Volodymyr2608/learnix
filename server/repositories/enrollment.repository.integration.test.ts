import { startOfMonth, subDays } from "date-fns";
import { describe, expect, it } from "vitest";
import { CourseStatus, EnrollmentStatus, Role } from "@/generated/prisma";
import { testDb } from "@/test/db";
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

describe("EnrollmentRepository.getInstructorStudentStatusCounts", () => {
	const cutoff = new Date("2026-06-09T00:00:00Z");

	it("counts students by derived status, summing to total", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: CourseStatus.published,
		});
		const active = await makeUser({ role: Role.STUDENT });
		const done = await makeUser({ role: Role.STUDENT });
		const stale = await makeUser({ role: Role.STUDENT });
		await makeEnrollment({
			studentId: active.id,
			courseId: course.id,
			progress: 30,
			lastAccessedAt: new Date("2026-06-15T00:00:00Z"),
		});
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
			progress: 10,
			lastAccessedAt: new Date("2026-05-01T00:00:00Z"),
		});

		const counts = await enrollmentRepository.getInstructorStudentStatusCounts(
			instructor.id,
			cutoff,
		);

		expect(counts).toEqual({
			total: 3,
			active: 1,
			completed: 1,
			inactive: 1,
		});
	});

	it("returns all zeros for an instructor with no students", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const counts = await enrollmentRepository.getInstructorStudentStatusCounts(
			instructor.id,
			cutoff,
		);
		expect(counts).toEqual({ total: 0, active: 0, completed: 0, inactive: 0 });
	});
});

describe("EnrollmentRepository.getStudentCompletionStats", () => {
	it("counts completed enrollments lifetime and by month", async () => {
		const { subMonths, startOfMonth } = await import("date-fns");
		const now = new Date();
		const thisMonthStart = startOfMonth(now);
		const lastMonthStart = startOfMonth(subMonths(now, 1));

		const student = await makeUser({ role: Role.STUDENT });
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const course1 = await makeCourse({
			instructorId: instructor.id,
			status: CourseStatus.published,
		});
		const course2 = await makeCourse({
			instructorId: instructor.id,
			status: CourseStatus.published,
		});
		const course3 = await makeCourse({
			instructorId: instructor.id,
			status: CourseStatus.published,
		});
		const course4 = await makeCourse({
			instructorId: instructor.id,
			status: CourseStatus.published,
		});

		// Completion this month
		await makeEnrollment({
			studentId: student.id,
			courseId: course1.id,
			status: EnrollmentStatus.completed,
			completedAt: new Date(thisMonthStart.getTime() + 1000 * 60 * 60 * 24 * 5), // 5 days into this month
		});

		// Completion last month
		await makeEnrollment({
			studentId: student.id,
			courseId: course2.id,
			status: EnrollmentStatus.completed,
			completedAt: new Date(
				lastMonthStart.getTime() + 1000 * 60 * 60 * 24 * 10,
			), // 10 days into last month
		});

		// Active enrollment (not completed) - should be excluded
		await makeEnrollment({
			studentId: student.id,
			courseId: course3.id,
			status: EnrollmentStatus.active,
			completedAt: null,
		});

		// Another completion this month
		await makeEnrollment({
			studentId: student.id,
			courseId: course4.id,
			status: EnrollmentStatus.completed,
			completedAt: new Date(
				thisMonthStart.getTime() + 1000 * 60 * 60 * 24 * 15,
			), // 15 days into this month
		});

		const stats = await enrollmentRepository.getStudentCompletionStats(
			student.id,
		);

		expect(stats.total).toBe(3); // 2 this month + 1 last month
		expect(stats.thisMonthNew).toBe(2);
		expect(stats.lastMonthNew).toBe(1);
	});
});

describe("enrollmentRepository.getStudentEnrollmentStats (integration)", () => {
	it("counts active, total, and this/last-month new enrollments by enrolledAt", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT });
		const now = new Date();
		const lastMonth = subDays(startOfMonth(now), 5); // safely in the previous month

		const courseA = await makeCourse({ instructorId: instructor.id });
		const courseB = await makeCourse({ instructorId: instructor.id });
		const courseC = await makeCourse({ instructorId: instructor.id });

		// active, enrolled this month
		await makeEnrollment({
			studentId: student.id,
			courseId: courseA.id,
			status: EnrollmentStatus.active,
			enrolledAt: now,
		});
		// active, enrolled last month
		await makeEnrollment({
			studentId: student.id,
			courseId: courseB.id,
			status: EnrollmentStatus.active,
			enrolledAt: lastMonth,
		});
		// cancelled, enrolled this month (counts toward total, not active)
		await makeEnrollment({
			studentId: student.id,
			courseId: courseC.id,
			status: EnrollmentStatus.cancelled,
			enrolledAt: now,
		});

		const stats = await enrollmentRepository.getStudentEnrollmentStats(
			student.id,
		);
		expect(stats).toEqual({
			active: 2,
			total: 3,
			thisMonthNew: 2, // A + C
			lastMonthNew: 1, // B
		});
	});
});

describe("enrollmentRepository.findInProgressForContinue (integration)", () => {
	it("returns only 0<progress<100 active enrollments, newest lastAccessedAt first, capped", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT });

		const inProgressNew = await makeCourse({
			instructorId: instructor.id,
			title: "In Progress New",
		});
		const inProgressOld = await makeCourse({
			instructorId: instructor.id,
			title: "In Progress Old",
		});
		const notStarted = await makeCourse({ instructorId: instructor.id });
		const finished = await makeCourse({ instructorId: instructor.id });

		await makeEnrollment({
			studentId: student.id,
			courseId: inProgressNew.id,
			status: EnrollmentStatus.active,
			progress: 50,
			lastAccessedAt: new Date(2026, 5, 17),
		});
		await makeEnrollment({
			studentId: student.id,
			courseId: inProgressOld.id,
			status: EnrollmentStatus.active,
			progress: 80,
			lastAccessedAt: new Date(2026, 5, 10),
		});
		await makeEnrollment({
			studentId: student.id,
			courseId: notStarted.id,
			status: EnrollmentStatus.active,
			progress: 0,
		});
		await makeEnrollment({
			studentId: student.id,
			courseId: finished.id,
			status: EnrollmentStatus.active,
			progress: 100,
		});

		const rows = await enrollmentRepository.findInProgressForContinue(
			student.id,
			3,
		);
		expect(rows).toEqual([
			{
				courseId: inProgressNew.id,
				courseTitle: "In Progress New",
				progress: 50,
			},
			{
				courseId: inProgressOld.id,
				courseTitle: "In Progress Old",
				progress: 80,
			},
		]);
	});
});

describe("EnrollmentRepository.getSkillProgress", () => {
	it("aggregates completed/enrolled per skill across the student's courses", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT });

		const react = await testDb.skill.create({
			data: { name: "React", slug: "react" },
		});
		const python = await testDb.skill.create({
			data: { name: "Python", slug: "python" },
		});

		const courseA = await makeCourse({ instructorId: instructor.id });
		const courseB = await makeCourse({ instructorId: instructor.id });
		const courseC = await makeCourse({ instructorId: instructor.id });

		await testDb.courseSkill.createMany({
			data: [
				{ courseId: courseA.id, skillId: react.id },
				{ courseId: courseB.id, skillId: react.id },
				{ courseId: courseC.id, skillId: python.id },
			],
		});

		await makeEnrollment({
			studentId: student.id,
			courseId: courseA.id,
			completedAt: new Date(),
		});
		await makeEnrollment({ studentId: student.id, courseId: courseB.id });
		await makeEnrollment({
			studentId: student.id,
			courseId: courseC.id,
			completedAt: new Date(),
		});

		const rows = await enrollmentRepository.getSkillProgress(student.id);

		expect(rows).toEqual(
			expect.arrayContaining([
				{ skillId: react.id, name: "React", enrolled: 2, completed: 1 },
				{ skillId: python.id, name: "Python", enrolled: 1, completed: 1 },
			]),
		);
		expect(rows).toHaveLength(2);
	});

	it("excludes courses the student isn't enrolled in and soft-deleted courses", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT });
		const otherStudent = await makeUser({ role: Role.STUDENT });

		const skill = await testDb.skill.create({
			data: { name: "SQL", slug: "sql" },
		});

		const notEnrolled = await makeCourse({ instructorId: instructor.id });
		const deletedCourse = await makeCourse({
			instructorId: instructor.id,
			deletedAt: new Date(),
		});
		await testDb.courseSkill.createMany({
			data: [
				{ courseId: notEnrolled.id, skillId: skill.id },
				{ courseId: deletedCourse.id, skillId: skill.id },
			],
		});
		await makeEnrollment({
			studentId: otherStudent.id,
			courseId: notEnrolled.id,
		});
		await makeEnrollment({ studentId: student.id, courseId: deletedCourse.id });

		const rows = await enrollmentRepository.getSkillProgress(student.id);

		expect(rows).toEqual([]);
	});
});
