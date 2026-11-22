import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openedLessonRepository } from "@/server/repositories/openedLesson.repository";
import { lessonService } from "@/server/services/lesson/lesson.service";
import { testDb } from "@/test/db";
import {
	makeCourse,
	makeEnrollment,
	makeLesson,
	makeSection,
	makeUser,
} from "@/test/factories";

describe("lessonService.getStudentLesson — opened-lesson record (FR-P19)", () => {
	let lessonId: string;
	let studentId: string;

	beforeEach(async () => {
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		const student = await makeUser();
		const course = await makeCourse({ instructorId: instructor.id });
		const section = await makeSection({ courseId: course.id });
		const lesson = await makeLesson({ sectionId: section.id });
		await makeEnrollment({ studentId: student.id, courseId: course.id });
		lessonId = lesson.id;
		studentId = student.id;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("records the lesson as opened when its content is returned (AC-C9)", async () => {
		await lessonService.getStudentLesson(lessonId, studentId);

		expect(
			await testDb.openedLesson.count({ where: { studentId, lessonId } }),
		).toBe(1);
	});

	it("returns no content when the record cannot be written (fail closed)", async () => {
		vi.spyOn(openedLessonRepository, "record").mockRejectedValue(
			new Error("db down"),
		);

		await expect(
			lessonService.getStudentLesson(lessonId, studentId),
		).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
	});
});
