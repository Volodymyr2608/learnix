import { startOfMonth, subMonths } from "date-fns";
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

describe("AnalyticsRepository.getEnrollmentTrend", () => {
	it("buckets enrollments and completions by month within range", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: CourseStatus.published,
		});
		const now = new Date();
		const thisMonth = startOfMonth(now);
		const lastMonth = startOfMonth(subMonths(now, 1));

		const s1 = await makeUser({ role: Role.STUDENT });
		const s2 = await makeUser({ role: Role.STUDENT });
		await makeEnrollment({
			studentId: s1.id,
			courseId: course.id,
			enrolledAt: lastMonth,
			completedAt: lastMonth,
		});
		await makeEnrollment({
			studentId: s2.id,
			courseId: course.id,
			enrolledAt: thisMonth,
		});

		const since = startOfMonth(subMonths(now, 2));
		const rows = await analyticsRepository.getEnrollmentTrend(
			[course.id],
			since,
			"month",
		);

		const total = rows.reduce((s, r) => s + r.enrollments, 0);
		const completed = rows.reduce((s, r) => s + r.completions, 0);
		expect(total).toBe(2);
		expect(completed).toBe(1);
	});
});

describe("AnalyticsRepository by-course + lesson completions", () => {
	it("groups enrollments by course and counts completed lessons", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: CourseStatus.published,
			title: "Course A",
		});
		const section = await makeSection({ courseId: course.id });
		const l1 = await makeLesson({
			sectionId: section.id,
			order: 0,
			title: "L1",
		});
		const l2 = await makeLesson({
			sectionId: section.id,
			order: 1,
			title: "L2",
		});

		const s1 = await makeUser({ role: Role.STUDENT });
		const s2 = await makeUser({ role: Role.STUDENT });
		await makeEnrollment({ studentId: s1.id, courseId: course.id });
		await makeEnrollment({ studentId: s2.id, courseId: course.id });
		await testDb.lessonProgress.create({
			data: { lessonId: l1.id, studentId: s1.id, isCompleted: true },
		});
		await testDb.lessonProgress.create({
			data: { lessonId: l1.id, studentId: s2.id, isCompleted: true },
		});
		await testDb.lessonProgress.create({
			data: { lessonId: l2.id, studentId: s1.id, isCompleted: true },
		});

		const since = new Date("2000-01-01");
		const byCourse = await analyticsRepository.getEnrollmentsByCourse(
			[course.id],
			since,
		);
		expect(byCourse).toEqual([
			{ courseId: course.id, title: "Course A", enrollments: 2 },
		]);

		const completions = await analyticsRepository.getLessonCompletions(
			course.id,
		);
		expect(completions.get(l1.id)).toBe(2);
		expect(completions.get(l2.id)).toBe(1);
	});
});
