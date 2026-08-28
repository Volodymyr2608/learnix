import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { MasteryEvidence } from "@/generated/prisma";
import { quizRepository } from "@/server/repositories/quiz.repository";
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

	// The level-3 write validated less than the level-2 one: toolPolicy guards a
	// tool write with canonicalisation and an 80-character bound, while promotion
	// wrote unschema'd model JSON after one typeof check. The higher authority
	// should not be the looser path.
	it("writes one canonical row for names that differ only in case and spacing", async () => {
		const only = await makeQuiz({ lessonId });
		await testDb.lessonInsights.update({
			where: { lessonId },
			data: {
				concepts: [
					{ name: "  Recursion ", explanation: "spaced" },
					{ name: "recursion", explanation: "lowercased" },
					{ name: "R".repeat(81), explanation: "too long" },
				],
			},
		});

		await quizService.submit(only.id, studentId, "A");

		const rows = await testDb.conceptMastery.findMany({ where: { studentId } });
		expect(rows.map((r) => r.concept)).toEqual(["Recursion"]);
	});

	it("records a first-pass promotion as earned on the first attempt", async () => {
		const only = await makeQuiz({ lessonId });

		await quizService.submit(only.id, studentId, "A");

		const row = await testDb.conceptMastery.findFirstOrThrow({
			where: { studentId },
		});
		expect(row.evidence).toBe(MasteryEvidence.QUIZ_FIRST_PASS);
	});

	it("records a promotion that took a retry as exactly that", async () => {
		const only = await makeQuiz({
			lessonId,
			options: ["A", "B", "C", "D"],
			correct: "C",
		});

		await quizService.submit(only.id, studentId, "A");
		await quizService.submit(only.id, studentId, "C");

		const row = await testDb.conceptMastery.findFirstOrThrow({
			where: { studentId },
		});
		expect(row.evidence).toBe(MasteryEvidence.QUIZ_RETRIED);
	});

	// One unknowable row makes the whole claim unverifiable, not merely
	// imperfect: the promotion says "every quiz answered correctly, and here is
	// how many tries it took", and for this student that second half is missing.
	it("records a promotion resting on a pre-counter attempt as legacy", async () => {
		const first = await makeQuiz({ lessonId });
		const second = await makeQuiz({ lessonId });
		await makeQuizAttempt({ quizId: first.id, studentId, isCorrect: true });

		await quizService.submit(second.id, studentId, "A");

		const row = await testDb.conceptMastery.findFirstOrThrow({
			where: { studentId },
		});
		expect(row.evidence).toBe(MasteryEvidence.LEGACY);
	});

	it("promotes on the last of three quizzes, and not before", async () => {
		const quizzes = [
			await makeQuiz({ lessonId }),
			await makeQuiz({ lessonId }),
			await makeQuiz({ lessonId }),
		];

		await quizService.submit(quizzes[0]?.id ?? "", studentId, "A");
		await quizService.submit(quizzes[1]?.id ?? "", studentId, "A");
		const beforeLast = await testDb.conceptMastery.count({
			where: { studentId },
		});
		await quizService.submit(quizzes[2]?.id ?? "", studentId, "A");

		expect(beforeLast).toBe(0);
		expect(await testDb.conceptMastery.count({ where: { studentId } })).toBe(1);
	});

	// A deleted quiz is not a question the student failed to answer: it is not a
	// question. Counting it would leave the lesson permanently uncompletable.
	it("does not count a deleted quiz toward the lesson", async () => {
		const quizzes = [
			await makeQuiz({ lessonId }),
			await makeQuiz({ lessonId }),
			await makeQuiz({ lessonId }),
		];
		await makeQuiz({ lessonId, deletedAt: new Date() });

		await quizService.submit(quizzes[0]?.id ?? "", studentId, "A");
		await quizService.submit(quizzes[1]?.id ?? "", studentId, "A");
		await quizService.submit(quizzes[2]?.id ?? "", studentId, "A");

		const row = await testDb.conceptMastery.findFirstOrThrow({
			where: { studentId },
		});
		expect(row.level).toBe(3);
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

const originalFindFirst = quizRepository.findFirst;
const originalFindByLesson = quizRepository.findByLesson;

// The narrowing in findByLesson could only break grading if grading read the key
// through it. It does not — it reads one whole row by id, a different call — and
// these pin that, so a future change to either read has to say so.
describe("quizService.submit — grading reads the key through a different door", () => {
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

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("does not read the lesson's quizzes at all to grade a wrong answer", async () => {
		const quiz = await makeQuiz({
			lessonId,
			options: ["A", "B"],
			correct: "B",
		});
		const findByLesson = vi.spyOn(quizRepository, "findByLesson");

		const attempt = await quizService.submit(quiz.id, studentId, "A");

		expect(attempt.isCorrect).toBe(false);
		expect(findByLesson).not.toHaveBeenCalled();
	});

	it("grades a correct answer before anything reads the lesson's quizzes", async () => {
		const quiz = await makeQuiz({
			lessonId,
			options: ["A", "B"],
			correct: "B",
		});
		const order: string[] = [];
		vi.spyOn(quizRepository, "findFirst").mockImplementation(async (args) => {
			order.push("findFirst");
			return await originalFindFirst.call(quizRepository, args);
		});
		vi.spyOn(quizRepository, "findByLesson").mockImplementation(async (id) => {
			order.push("findByLesson");
			return await originalFindByLesson.call(quizRepository, id);
		});

		const attempt = await quizService.submit(quiz.id, studentId, "B");

		expect(attempt.isCorrect).toBe(true);
		// findByLesson appears only after grading, and only because the promotion
		// that follows it counts how many quizzes the lesson has.
		expect(order[0]).toBe("findFirst");
		expect(order).toContain("findByLesson");
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
		// On the message, not on JSON.stringify(error) — an Error's message is
		// non-enumerable, so stringifying it yields "{}" and asserts nothing.
		expect((error as AttemptLimitError).message).toBe(
			"No attempts left for this question",
		);
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

	// A fresh window, but not a fresh history: the lifetime count keeps climbing,
	// which is what a promotion reads to decide whether this was a first pass.
	it("lets the student try again once the cooldown has passed, in a fresh window", async () => {
		const quiz = await cappedQuiz();
		await quizService.submit(quiz.id, studentId, "A");
		await quizService.submit(quiz.id, studentId, "B");
		await quizService.submit(quiz.id, studentId, "C");
		await moveAttemptBack(quiz.id, 25);

		const next = await quizService.submit(quiz.id, studentId, "A");

		expect(next).toMatchObject({
			windowCount: 1,
			attemptCount: 4,
			isCorrect: false,
		});
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

	// A row whose history is unknown gets the ordinary cap from here on — its
	// window is knowable even when its lifetime is not — and the lifetime count
	// stays NULL, so a promotion built on it is still marked as legacy evidence.
	it("caps a row of unknown history without inventing a history for it", async () => {
		const quiz = await cappedQuiz();
		await makeQuizAttempt({
			quizId: quiz.id,
			studentId,
			isCorrect: false,
			createdAt: new Date(Date.now() - 72 * 60 * 60 * 1000),
		});
		await moveAttemptBack(quiz.id, 72);

		const first = await quizService.submit(quiz.id, studentId, "A");
		await quizService.submit(quiz.id, studentId, "B");
		await quizService.submit(quiz.id, studentId, "C");
		const fourth = quizService.submit(quiz.id, studentId, "D");

		expect(first.attemptCount).toBeNull();
		expect(first.windowCount).toBe(1);
		await expect(fourth).rejects.toThrow(AttemptLimitError);
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
