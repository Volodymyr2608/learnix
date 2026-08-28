import { beforeEach, describe, expect, it } from "vitest";
import { lessonService } from "@/server/services/lesson/lesson.service";
import { findKeyPaths } from "@/test/deepKeys";
import {
	makeCourse,
	makeEnrollment,
	makeLesson,
	makeQuiz,
	makeSection,
	makeUser,
} from "@/test/factories";

describe("lessonService.getStudentLesson — the quiz projection", () => {
	let lessonId: string;
	let studentId: string;
	let instructorId: string;

	beforeEach(async () => {
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		const student = await makeUser();
		const course = await makeCourse({ instructorId: instructor.id });
		const section = await makeSection({ courseId: course.id });
		const lesson = await makeLesson({ sectionId: section.id });
		await makeEnrollment({ studentId: student.id, courseId: course.id });
		await makeQuiz({
			lessonId: lesson.id,
			options: ["A", "B", "C", "D"],
			correct: "SENTINEL",
		});
		lessonId = lesson.id;
		studentId = student.id;
		instructorId = instructor.id;
	});

	it("carries no answer key on any nested quiz", async () => {
		const lesson = await lessonService.getStudentLesson(lessonId, studentId);

		expect(findKeyPaths(lesson, "correct")).toEqual([]);
	});

	it("still carries what the lesson view renders", async () => {
		const lesson = await lessonService.getStudentLesson(lessonId, studentId);

		expect(lesson.quizzes[0]).toMatchObject({
			question: "What is a base case?",
			options: ["A", "B", "C", "D"],
			lessonId,
		});
	});

	// Checked by `pnpm typecheck`, not at runtime: if the student projection ever
	// carries the key again, this @ts-expect-error becomes unused and the build
	// fails. That is what the removed `as … & { quizzes: Quiz[] }` cast used to
	// prevent — under it, a component read `undefined` and the plausible fix was
	// to put the field back.
	it("does not type the key as reachable from a student component", async () => {
		const lesson = await lessonService.getStudentLesson(lessonId, studentId);

		// @ts-expect-error — no `correct` on the student projection
		expect(lesson.quizzes[0]?.correct).toBeUndefined();
	});

	// The split is by audience, not by role inside one function: the instructor
	// who owns the lesson is editing the key and must still see it.
	it("leaves the instructor's own read untouched", async () => {
		const lesson = await lessonService.getLesson(lessonId, instructorId);

		expect(lesson.quizzes[0]?.correct).toBe("SENTINEL");
	});
});
