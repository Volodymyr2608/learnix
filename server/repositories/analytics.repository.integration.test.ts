import { describe, expect, it } from "vitest";
import { CourseStatus, Role } from "@/generated/prisma";
import { testDb } from "@/test/db";
import {
	makeCourse,
	makeEnrollment,
	makeLesson,
	makeSection,
	makeUser,
} from "@/test/factories";
import { analyticsRepository } from "./analytics.repository";

describe("AnalyticsRepository summary aggregates", () => {
	it("scopes course ids, counts enrollments, active learners, avg progress, quiz stats", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const other = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: CourseStatus.published,
		});
		const otherCourse = await makeCourse({ instructorId: other.id });

		const ids = await analyticsRepository.getInstructorCourseIds(instructor.id);
		expect(ids).toEqual([course.id]);

		const now = new Date();
		const s1 = await makeUser({ role: Role.STUDENT });
		const s2 = await makeUser({ role: Role.STUDENT });
		await makeEnrollment({
			studentId: s1.id,
			courseId: course.id,
			progress: 80,
			lastAccessedAt: now,
		});
		await makeEnrollment({
			studentId: s2.id,
			courseId: course.id,
			progress: 20,
			lastAccessedAt: new Date("2000-01-01"),
		});
		// enrollment on someone else's course must be excluded
		await makeEnrollment({
			studentId: s1.id,
			courseId: otherCourse.id,
			progress: 100,
		});

		expect(await analyticsRepository.countEnrollments([course.id])).toBe(2);
		const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
		const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
		expect(
			await analyticsRepository.countActiveLearners([course.id], {
				gte: monthStart,
				lt: monthEnd,
			}),
		).toBe(1);
		expect(await analyticsRepository.getAvgProgress([course.id])).toBe(50);
		expect(await analyticsRepository.getAvgProgress([])).toBe(0);

		// quiz stats
		const section = await makeSection({ courseId: course.id });
		const lesson = await makeLesson({ sectionId: section.id });
		const quiz = await testDb.quiz.create({
			data: {
				question: "q",
				options: ["a", "b"],
				correct: "a",
				lessonId: lesson.id,
			},
		});
		await testDb.quizAttempt.create({
			data: {
				quizId: quiz.id,
				studentId: s1.id,
				selectedAnswer: "a",
				isCorrect: true,
			},
		});
		await testDb.quizAttempt.create({
			data: {
				quizId: quiz.id,
				studentId: s2.id,
				selectedAnswer: "b",
				isCorrect: false,
			},
		});
		const stats = await analyticsRepository.getQuizStats([course.id]);
		expect(stats).toEqual({ attempts: 2, correct: 1 });
	});
});
