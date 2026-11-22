import { beforeEach, describe, expect, it } from "vitest";
import { learningRecordsRepository } from "@/server/repositories/learningRecords.repository";
import { testDb, truncateAll } from "@/test/db";
import {
	makeCourse,
	makeEnrollment,
	makeLesson,
	makeLessonProgress,
	makeQuiz,
	makeQuizAttempt,
	makeSection,
	makeUser,
} from "@/test/factories";
import { studentService } from "./student.service";

const DAY = 24 * 60 * 60 * 1000;
/** Noon UTC, `daysAgo` days back — clear of every day and week boundary in any test time zone. */
const noonDaysAgo = (daysAgo: number) => {
	const now = new Date();
	return new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12) -
			daysAgo * DAY,
	);
};

describe("study statistics are unchanged by a refund (AC-F29, A11)", () => {
	let studentId: string;
	let refundedCourseId: string;

	beforeEach(async () => {
		await truncateAll();
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		studentId = (await makeUser()).id;

		const seed = async (minutes: number[], daysAgo: number[]) => {
			const course = await makeCourse({ instructorId: instructor.id });
			const section = await makeSection({ courseId: course.id });
			await makeEnrollment({ studentId, courseId: course.id });
			for (const [i, m] of minutes.entries()) {
				const lesson = await makeLesson({
					sectionId: section.id,
					order: i + 1,
					durationMinutes: m,
				});
				await makeLessonProgress({
					lessonId: lesson.id,
					studentId,
					isCompleted: true,
					completedAt: noonDaysAgo(daysAgo[i] ?? 0),
				});
				const quiz = await makeQuiz({ lessonId: lesson.id });
				await makeQuizAttempt({
					quizId: quiz.id,
					studentId,
					isCorrect: i % 2 === 0,
				});
			}
			return course.id;
		};

		// The refunded course carries today and the two previous days of a streak.
		refundedCourseId = await seed([10, 20, 30, 15], [0, 1, 2, 9]);
		await seed([25], [3]);
	});

	it("keeps lifetime minutes, weekly chart, week-over-week, streak, study days and achievements", async () => {
		const snapshot = async () => ({
			progress: await studentService.getProgressStats(studentId),
			achievements: await studentService.getAchievements(studentId),
			dashboard: await studentService.getDashboardStats(studentId),
		});
		const before = await snapshot();
		expect(before.progress.currentStreakDays ?? before.progress).toBeTruthy();

		await testDb.$transaction((tx) =>
			learningRecordsRepository.clearForRefund(tx, studentId, refundedCourseId),
		);

		expect(await snapshot()).toEqual(before);
	});
});
