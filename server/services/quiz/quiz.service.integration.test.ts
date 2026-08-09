import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { quizService } from "@/server/services/quiz/quiz.service";
import { testDb, truncateAll } from "@/test/db";
import {
	makeCourse,
	makeEnrollment,
	makeLesson,
	makeLessonInsights,
	makeQuiz,
	makeQuizAttempt,
	makeSection,
	makeUser,
} from "@/test/factories";

describe("quizService.submit — mastery promotion", () => {
	let studentId: string;
	let lessonId: string;

	const setup = async (opts: { withInsights: boolean }) => {
		await truncateAll();
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		const student = await makeUser();
		const course = await makeCourse({ instructorId: instructor.id });
		const section = await makeSection({ courseId: course.id });
		const lesson = await makeLesson({ sectionId: section.id });
		await makeEnrollment({ studentId: student.id, courseId: course.id });
		if (opts.withInsights) await makeLessonInsights({ lessonId: lesson.id });
		studentId = student.id;
		lessonId = lesson.id;
	};

	beforeEach(() => setup({ withInsights: true }));

	afterAll(async () => {
		await testDb.$disconnect();
	});

	it("promotes nothing while a quiz on the lesson is still unanswered", async () => {
		const first = await makeQuiz({ lessonId });
		await makeQuiz({ lessonId });

		await quizService.submit(first.id, studentId, "A");

		const rows = await testDb.conceptMastery.findMany({ where: { studentId } });
		expect(rows).toHaveLength(0);
	});

	it("promotes every lesson concept to 3 once the last quiz is answered correctly", async () => {
		const first = await makeQuiz({ lessonId });
		const second = await makeQuiz({ lessonId });

		await quizService.submit(first.id, studentId, "A");
		await quizService.submit(second.id, studentId, "A");

		const rows = await testDb.conceptMastery.findMany({ where: { studentId } });
		expect(rows).toHaveLength(1);
		expect(rows[0]?.concept).toBe("Recursion");
		expect(rows[0]?.level).toBe(3);
	});

	// QuizAttempt has no unique constraint on (quizId, studentId) and submit()
	// does read-then-write, so a double-click leaves two correct rows for one
	// quiz. Counting rows rather than distinct quizzes would read that as a
	// finished lesson and promote to 3 — irreversibly, since mastery is monotonic.
	it("promotes nothing when duplicate attempts inflate the count to the quiz total", async () => {
		const first = await makeQuiz({ lessonId });
		const second = await makeQuiz({ lessonId });
		await makeQuiz({ lessonId }); // third, never attempted

		// The double-click: two correct rows for one quiz.
		await makeQuizAttempt({ quizId: first.id, studentId, isCorrect: true });
		await makeQuizAttempt({ quizId: first.id, studentId, isCorrect: true });

		// Now 3 correct ROWS across 3 quizzes, but only 2 DISTINCT quizzes done.
		await quizService.submit(second.id, studentId, "A");

		const rows = await testDb.conceptMastery.findMany({ where: { studentId } });
		expect(rows).toHaveLength(0);
	});

	it("promotes nothing on a wrong answer", async () => {
		const only = await makeQuiz({ lessonId });

		await quizService.submit(only.id, studentId, "B");

		const rows = await testDb.conceptMastery.findMany({ where: { studentId } });
		expect(rows).toHaveLength(0);
	});

	it("promotes nothing when the lesson has no insights to name concepts", async () => {
		await setup({ withInsights: false });
		const only = await makeQuiz({ lessonId });

		await quizService.submit(only.id, studentId, "A");

		const rows = await testDb.conceptMastery.findMany({ where: { studentId } });
		expect(rows).toHaveLength(0);
	});
});
