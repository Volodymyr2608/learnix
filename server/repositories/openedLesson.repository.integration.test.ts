import { beforeEach, describe, expect, it } from "vitest";
import { openedLessonRepository } from "@/server/repositories/openedLesson.repository";
import { testDb } from "@/test/db";
import {
	makeCourse,
	makeLesson,
	makeSection,
	makeUser,
} from "@/test/factories";

const counts = (studentId: string, courseId: string) =>
	testDb.$transaction((tx) =>
		openedLessonRepository.countCourseLessons(tx, studentId, courseId),
	);

describe("openedLessonRepository", () => {
	let studentId: string;
	let courseId: string;
	let lessonIds: string[];

	beforeEach(async () => {
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		const student = await makeUser();
		const course = await makeCourse({ instructorId: instructor.id });
		const section = await makeSection({ courseId: course.id });
		lessonIds = [];
		for (let order = 0; order < 5; order++) {
			const lesson = await makeLesson({ sectionId: section.id, order });
			lessonIds.push(lesson.id);
		}
		studentId = student.id;
		courseId = course.id;
	});

	it("counts a lesson opened twice once (AC-F3)", async () => {
		await openedLessonRepository.record(studentId, lessonIds[0] as string);
		await openedLessonRepository.record(studentId, lessonIds[0] as string);

		expect(await counts(studentId, courseId)).toEqual({
			lessonCount: 5,
			openedCount: 1,
		});
	});

	it("drops a deleted lesson from both L and opened (EC-3)", async () => {
		await openedLessonRepository.record(studentId, lessonIds[0] as string);
		await openedLessonRepository.record(studentId, lessonIds[1] as string);
		await testDb.lesson.update({
			where: { id: lessonIds[1] },
			data: { deletedAt: new Date() },
		});

		expect(await counts(studentId, courseId)).toEqual({
			lessonCount: 4,
			openedCount: 1,
		});
	});

	it("drops lessons of a deleted section from both counts (P3)", async () => {
		const deletedSection = await makeSection({ courseId, order: 1 });
		const hidden = await makeLesson({ sectionId: deletedSection.id });
		await openedLessonRepository.record(studentId, hidden.id);
		await testDb.section.update({
			where: { id: deletedSection.id },
			data: { deletedAt: new Date() },
		});

		expect(await counts(studentId, courseId)).toEqual({
			lessonCount: 5,
			openedCount: 0,
		});
	});

	it("ignores lessons opened in another course", async () => {
		const otherCourse = await makeCourse({
			instructorId: (await makeUser({ role: "INSTRUCTOR" })).id,
		});
		const otherSection = await makeSection({ courseId: otherCourse.id });
		const otherLesson = await makeLesson({ sectionId: otherSection.id });
		await openedLessonRepository.record(studentId, otherLesson.id);

		expect(await counts(studentId, courseId)).toEqual({
			lessonCount: 5,
			openedCount: 0,
		});
	});
});
