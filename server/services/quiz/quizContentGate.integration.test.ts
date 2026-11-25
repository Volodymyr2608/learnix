import { beforeEach, describe, expect, it } from "vitest";
import { testDb, truncateAll } from "@/test/db";
import {
	makeCourse,
	makeEnrollment,
	makeLesson,
	makeOpenedLesson,
	makeQuiz,
	makeSection,
	makeUser,
} from "@/test/factories";
import { quizService } from "./quiz.service";

describe("quizzes only for an opened lesson (AI-C4, AC-L4)", () => {
	let studentId: string;
	let lessonId: string;
	let quizId: string;

	beforeEach(async () => {
		await truncateAll();
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		studentId = (await makeUser()).id;
		const course = await makeCourse({ instructorId: instructor.id });
		const section = await makeSection({ courseId: course.id });
		lessonId = (await makeLesson({ sectionId: section.id })).id;
		quizId = (await makeQuiz({ lessonId })).id;
		await makeEnrollment({ studentId, courseId: course.id });
	});

	it("forbids getting or submitting a quiz of an unopened lesson and stores no attempt", async () => {
		await expect(
			quizService.getByLesson(lessonId, studentId),
		).rejects.toMatchObject({
			code: "FORBIDDEN",
			message: "Open the lesson first",
		});
		await expect(
			quizService.submit(quizId, studentId, "A"),
		).rejects.toMatchObject({
			code: "FORBIDDEN",
			message: "Open the lesson first",
		});
		expect(await testDb.quizAttempt.count()).toBe(0);
	});

	it("serves both once the lesson is opened", async () => {
		await makeOpenedLesson({ studentId, lessonId });

		expect(await quizService.getByLesson(lessonId, studentId)).toHaveLength(1);
		await quizService.submit(quizId, studentId, "A");
		expect(await testDb.quizAttempt.count()).toBe(1);
	});
});
