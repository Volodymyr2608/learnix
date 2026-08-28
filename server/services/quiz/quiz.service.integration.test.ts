import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
	AttemptLimitError,
	QuizNotFoundError,
} from "@/server/services/quiz/quiz.errors";
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

	// A double-click used to leave two correct rows for one quiz, because submit()
	// did read-then-write against a table with no unique constraint. Counting rows
	// rather than distinct quizzes would then read that as a finished lesson and
	// promote to 3 — irreversibly, since mastery is monotonic. The constraint now
	// makes the second row impossible, and the distinct count stays as the guard
	// for rows that predate it.
	it("cannot be given a duplicate attempt to inflate the count with", async () => {
		const first = await makeQuiz({ lessonId });
		const second = await makeQuiz({ lessonId });
		await makeQuiz({ lessonId }); // third, never attempted

		await makeQuizAttempt({ quizId: first.id, studentId, isCorrect: true });
		await expect(
			makeQuizAttempt({ quizId: first.id, studentId, isCorrect: true }),
		).rejects.toThrow(/Unique constraint/i);

		// Two distinct quizzes done out of three: still not a finished lesson.
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

describe("quizService.submit — the attempt cap", () => {
	let studentId: string;
	let lessonId: string;

	beforeEach(async () => {
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

	afterAll(async () => {
		await testDb.$disconnect();
	});

	// The correct option is the one the cap denies. With four options the cap is
	// three, so a fixture whose answer sits inside the first three attempts would
	// pass three runs in four by luck rather than by behaviour.
	const cappedQuiz = () =>
		makeQuiz({
			lessonId,
			options: ["A", "B", "C", "D"],
			correct: "D",
		});

	it("runs a client out of attempts before it runs out of options", async () => {
		const quiz = await cappedQuiz();

		await quizService.submit(quiz.id, studentId, "A");
		await quizService.submit(quiz.id, studentId, "B");
		await quizService.submit(quiz.id, studentId, "C");

		await expect(quizService.submit(quiz.id, studentId, "D")).rejects.toThrow(
			AttemptLimitError,
		);

		const attempt = await testDb.quizAttempt.findFirstOrThrow({
			where: { quizId: quiz.id, studentId },
		});
		const mastery = await testDb.conceptMastery.findMany({
			where: { studentId },
		});
		expect(attempt).toMatchObject({ attemptCount: 3, isCorrect: false });
		expect(mastery).toHaveLength(0);
	});

	it("tells a capped student nothing about the answer they submitted", async () => {
		const quiz = await cappedQuiz();
		await quizService.submit(quiz.id, studentId, "A");
		await quizService.submit(quiz.id, studentId, "B");
		await quizService.submit(quiz.id, studentId, "C");

		const error = await quizService
			.submit(quiz.id, studentId, "D")
			.catch((e: unknown) => e);

		expect(error).toBeInstanceOf(AttemptLimitError);
		expect(JSON.stringify(error)).not.toContain("D");
	});

	it("caps a two-option quiz at a single attempt", async () => {
		const quiz = await makeQuiz({
			lessonId,
			options: ["A", "B"],
			correct: "B",
		});

		await quizService.submit(quiz.id, studentId, "A");

		await expect(quizService.submit(quiz.id, studentId, "B")).rejects.toThrow(
			AttemptLimitError,
		);
	});

	it("counts parallel submissions against the same cap", async () => {
		const quiz = await cappedQuiz();

		// Every option here is wrong — the correct one is "D", outside the cap.
		// A parallel run that included it would make the fulfilled count depend on
		// which request won the race rather than on the cap.
		const results = await Promise.allSettled(
			["A", "B", "C", "A", "B", "C"].map((option) =>
				quizService.submit(quiz.id, studentId, option),
			),
		);

		const attempt = await testDb.quizAttempt.findFirstOrThrow({
			where: { quizId: quiz.id, studentId },
		});
		expect(attempt.attemptCount).toBe(3);
		expect(attempt.isCorrect).toBe(false);
		expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
	});

	const moveAttemptBack = (quizId: string, hours: number) =>
		testDb.quizAttempt.updateMany({
			where: { quizId, studentId },
			data: { updatedAt: new Date(Date.now() - hours * 60 * 60 * 1000) },
		});

	it("lets the student try again once the cooldown has passed, from a fresh count", async () => {
		const quiz = await cappedQuiz();
		await quizService.submit(quiz.id, studentId, "A");
		await quizService.submit(quiz.id, studentId, "B");
		await quizService.submit(quiz.id, studentId, "C");
		await moveAttemptBack(quiz.id, 25);

		const next = await quizService.submit(quiz.id, studentId, "A");

		expect(next).toMatchObject({ attemptCount: 1, isCorrect: false });
	});

	it("still refuses an hour before the cooldown is up", async () => {
		const quiz = await cappedQuiz();
		await quizService.submit(quiz.id, studentId, "A");
		await quizService.submit(quiz.id, studentId, "B");
		await quizService.submit(quiz.id, studentId, "C");
		await moveAttemptBack(quiz.id, 23);

		await expect(quizService.submit(quiz.id, studentId, "A")).rejects.toThrow(
			AttemptLimitError,
		);
	});

	// A row whose history is unknown cannot be counted against a cap, so it is
	// bounded by the cooldown alone: one attempt per window, and the count stays
	// NULL so a promotion built on it is still marked as legacy evidence.
	it("gives a row of unknown history one attempt per cooldown window", async () => {
		const quiz = await cappedQuiz();
		await makeQuizAttempt({
			quizId: quiz.id,
			studentId,
			isCorrect: false,
			createdAt: new Date(Date.now() - 72 * 60 * 60 * 1000),
		});
		await moveAttemptBack(quiz.id, 72);

		const first = await quizService.submit(quiz.id, studentId, "A");
		const second = quizService.submit(quiz.id, studentId, "B");

		expect(first.attemptCount).toBeNull();
		await expect(second).rejects.toThrow(AttemptLimitError);
	});

	it("refuses a submission for a quiz the instructor has deleted", async () => {
		const quiz = await cappedQuiz();
		await testDb.quiz.update({
			where: { id: quiz.id },
			data: { deletedAt: new Date() },
		});

		await expect(quizService.submit(quiz.id, studentId, "D")).rejects.toThrow(
			QuizNotFoundError,
		);

		const attempts = await testDb.quizAttempt.findMany({
			where: { quizId: quiz.id },
		});
		expect(attempts).toHaveLength(0);
	});

	it("accepts the same submission before the quiz is deleted", async () => {
		const quiz = await cappedQuiz();

		const attempt = await quizService.submit(quiz.id, studentId, "D");

		expect(attempt.isCorrect).toBe(true);
	});

	it("still lets a student retry inside the cap", async () => {
		const quiz = await makeQuiz({
			lessonId,
			options: ["A", "B", "C", "D"],
			correct: "C",
		});

		await quizService.submit(quiz.id, studentId, "A");
		const second = await quizService.submit(quiz.id, studentId, "C");

		expect(second).toMatchObject({ isCorrect: true, attemptCount: 2 });
	});
});
