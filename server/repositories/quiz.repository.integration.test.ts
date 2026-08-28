import { beforeEach, describe, expect, it } from "vitest";
import { quizRepository } from "@/server/repositories/quiz.repository";
import { testDb } from "@/test/db";
import {
	makeCourse,
	makeLesson,
	makeQuiz,
	makeQuizAttempt,
	makeSection,
	makeUser,
} from "@/test/factories";

describe("quizRepository.findByLesson", () => {
	let lessonId: string;

	beforeEach(async () => {
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		const course = await makeCourse({ instructorId: instructor.id });
		const section = await makeSection({ courseId: course.id });
		const lesson = await makeLesson({ sectionId: section.id });
		lessonId = lesson.id;
	});

	// Narrowed at the repository, not at the caller: a field that is never loaded
	// cannot be spread into a response, written to a log line, or re-exposed by a
	// caller added later.
	it("never loads the answer key", async () => {
		await makeQuiz({ lessonId, correct: "SENTINEL" });

		const [quiz] = await quizRepository.findByLesson(lessonId);

		expect(Object.keys(quiz ?? {}).sort()).toEqual([
			"id",
			"lessonId",
			"options",
			"question",
		]);
	});

	it("still returns the fields its callers read", async () => {
		await makeQuiz({
			lessonId,
			question: "What is a base case?",
			options: ["A", "B", "C", "D"],
		});

		const [quiz] = await quizRepository.findByLesson(lessonId);

		expect(quiz).toMatchObject({
			question: "What is a base case?",
			options: ["A", "B", "C", "D"],
			lessonId,
		});
	});

	// `getByLesson` pairs quizzes[i] with attempts[i] positionally, so the order
	// is load-bearing: a projection change that disturbs it shows a student
	// someone else's attempt state.
	it("still orders by id ascending", async () => {
		await makeQuiz({ lessonId, id: "quiz-c", question: "c" });
		await makeQuiz({ lessonId, id: "quiz-a", question: "a" });
		await makeQuiz({ lessonId, id: "quiz-b", question: "b" });

		const quizzes = await quizRepository.findByLesson(lessonId);

		expect(quizzes.map((q) => q.id)).toEqual(["quiz-a", "quiz-b", "quiz-c"]);
	});

	// The third audience S3 asks for: a deliberate accessor, not a widening of the
	// student read. Callers verify ownership before reaching it.
	it("has an author's accessor that does keep the key", async () => {
		await makeQuiz({ lessonId, correct: "SENTINEL" });

		const [quiz] = await quizRepository.findByLessonForAuthor(lessonId);

		expect(quiz?.correct).toBe("SENTINEL");
	});

	// The attempt row is the evidence of record: a cap, a cooldown and the
	// provenance of any level-3 promotion all read it. Replacing a lesson's
	// questions must not destroy it — a hard delete cascades to QuizAttempt.
	it("keeps every student's attempt history when the questions are replaced", async () => {
		const quiz = await makeQuiz({ lessonId, question: "old" });
		const student = await makeUser();
		await makeQuizAttempt({
			quizId: quiz.id,
			studentId: student.id,
			isCorrect: false,
		});

		await quizRepository.replaceForLesson(lessonId, [
			{ question: "new", options: ["A", "B"], correct: "A" },
		]);

		const attempts = await testDb.quizAttempt.findMany({
			where: { studentId: student.id },
		});
		const live = await quizRepository.findByLesson(lessonId);
		expect(attempts).toHaveLength(1);
		expect(live.map((q) => q.question)).toEqual(["new"]);
	});

	it("leaves out quizzes the instructor has deleted", async () => {
		await makeQuiz({ lessonId, question: "live" });
		await makeQuiz({ lessonId, question: "gone", deletedAt: new Date() });

		const quizzes = await quizRepository.findByLesson(lessonId);

		expect(quizzes.map((q) => q.question)).toEqual(["live"]);
	});
});
