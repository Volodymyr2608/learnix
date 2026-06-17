import { subDays } from "date-fns";
import { describe, expect, it } from "vitest";
import { CourseStatus, Role } from "@/generated/prisma";
import {
	makeCourse,
	makeLesson,
	makeLessonProgress,
	makeSection,
	makeUser,
} from "@/test/factories";
import { lessonProgressRepository } from "./lessonProgress.repository";

describe("lessonProgressRepository.getCompletedMinutesTotals (integration)", () => {
	it("sums durationMinutes over completed lessons with COALESCE for nulls", async () => {
		// Seed: student with 2 completed lessons (durationMinutes 30 + null) this week,
		// 1 completed lesson (60) two weeks ago; one incomplete lesson (90) must be ignored.
		const { studentId } = await seedCompletedLessons();
		const totals =
			await lessonProgressRepository.getCompletedMinutesTotals(studentId);
		expect(totals.lifetimeMinutes).toBe(90); // 30 + 0(null) + 60
		expect(totals.thisWeekMinutes).toBe(30);
		expect(totals.priorWeekMinutes).toBe(60);
	});
});

async function seedCompletedLessons() {
	const student = await makeUser({ role: Role.STUDENT });
	const instructor = await makeUser({ role: Role.INSTRUCTOR });
	const course = await makeCourse({
		instructorId: instructor.id,
		status: CourseStatus.published,
	});
	const section = await makeSection({ courseId: course.id });

	const now = new Date();
	const thisWeekDate = subDays(now, 2); // 2 days ago - within this week
	const priorWeekDate = subDays(now, 10); // 10 days ago - within prior week

	// Lesson 1: 30 minutes, completed this week
	const lesson1 = await makeLesson({
		sectionId: section.id,
		durationMinutes: 30,
	});
	await makeLessonProgress({
		studentId: student.id,
		lessonId: lesson1.id,
		isCompleted: true,
		completedAt: thisWeekDate,
	});

	// Lesson 2: null durationMinutes, completed this week
	const lesson2 = await makeLesson({
		sectionId: section.id,
		durationMinutes: null,
	});
	await makeLessonProgress({
		studentId: student.id,
		lessonId: lesson2.id,
		isCompleted: true,
		completedAt: thisWeekDate,
	});

	// Lesson 3: 60 minutes, completed prior week
	const lesson3 = await makeLesson({
		sectionId: section.id,
		durationMinutes: 60,
	});
	await makeLessonProgress({
		studentId: student.id,
		lessonId: lesson3.id,
		isCompleted: true,
		completedAt: priorWeekDate,
	});

	// Lesson 4: 90 minutes, NOT completed (should be ignored)
	const lesson4 = await makeLesson({
		sectionId: section.id,
		durationMinutes: 90,
	});
	await makeLessonProgress({
		studentId: student.id,
		lessonId: lesson4.id,
		isCompleted: false,
		completedAt: null,
	});

	return { studentId: student.id };
}
