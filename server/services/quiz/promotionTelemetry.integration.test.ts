import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "@/test/db";
import {
	makeCourse,
	makeEnrollment,
	makeLesson,
	makeLessonInsights,
	makeQuiz,
	makeSection,
	makeUser,
} from "@/test/factories";

const { mockLogSecurityEvent } = vi.hoisted(() => ({
	mockLogSecurityEvent: vi.fn(),
}));

vi.mock("@/server/services/_shared/aiGuard/securityLog", async (original) => ({
	...((await original()) as Record<string, unknown>),
	logSecurityEvent: mockLogSecurityEvent,
}));

const { quizService } = await import("@/server/services/quiz/quiz.service");

describe("a level-3 promotion is visible in telemetry", () => {
	let studentId: string;
	let lessonId: string;

	beforeEach(async () => {
		mockLogSecurityEvent.mockClear();
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		const student = await makeUser();
		const course = await makeCourse({ instructorId: instructor.id });
		const section = await makeSection({ courseId: course.id });
		const lesson = await makeLesson({ sectionId: section.id });
		await makeEnrollment({ studentId: student.id, courseId: course.id });
		await makeLessonInsights({ lessonId: lesson.id });
		studentId = student.id;
		lessonId = lesson.id;
	});

	it("emits one event for the batch, carrying no concept name", async () => {
		const only = await makeQuiz({ lessonId });

		await quizService.submit(only.id, studentId, "A");

		expect(mockLogSecurityEvent).toHaveBeenCalledTimes(1);
		expect(mockLogSecurityEvent).toHaveBeenCalledWith({
			feature: "quizAI",
			userId: studentId,
			layer: "mastery_write",
			outcome: "mastery_promoted",
			ruleIds: ["quiz_lesson_complete"],
			score: 0,
			subject: { kind: "lesson", id: lessonId },
		});
		// The concept the lesson teaches, and the one the promotion just wrote.
		// The event has no field to carry it, and this says so out loud.
		expect(JSON.stringify(mockLogSecurityEvent.mock.calls)).not.toContain(
			"Recursion",
		);
	});

	it("emits one event, not one per concept", async () => {
		const only = await makeQuiz({ lessonId });
		await testDb.lessonInsights.update({
			where: { lessonId },
			data: {
				concepts: [
					{ name: "Recursion", explanation: "one" },
					{ name: "Base case", explanation: "two" },
					{ name: "Stack depth", explanation: "three" },
				],
			},
		});

		await quizService.submit(only.id, studentId, "A");

		const rows = await testDb.conceptMastery.findMany({ where: { studentId } });
		expect(rows).toHaveLength(3);
		expect(mockLogSecurityEvent).toHaveBeenCalledTimes(1);
	});

	it("emits nothing while a quiz on the lesson is still unanswered", async () => {
		const first = await makeQuiz({ lessonId });
		await makeQuiz({ lessonId });

		await quizService.submit(first.id, studentId, "A");

		expect(mockLogSecurityEvent).not.toHaveBeenCalled();
	});
});
