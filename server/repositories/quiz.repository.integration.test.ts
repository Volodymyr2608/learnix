import { beforeEach, describe, expect, it } from "vitest";
import { quizRepository } from "@/server/repositories/quiz.repository";
import {
	makeCourse,
	makeLesson,
	makeQuiz,
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
			"deletedAt",
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

	it("leaves out quizzes the instructor has deleted", async () => {
		await makeQuiz({ lessonId, question: "live" });
		await makeQuiz({ lessonId, question: "gone", deletedAt: new Date() });

		const quizzes = await quizRepository.findByLesson(lessonId);

		expect(quizzes.map((q) => q.question)).toEqual(["live"]);
	});
});
