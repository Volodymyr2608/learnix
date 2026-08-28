// Set NODE_ENV to production so the timing middleware skips the artificial delay
Object.assign(process.env, { NODE_ENV: "production" });

import SuperJSON from "superjson";
import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@/generated/prisma";
import { createCallerFactory } from "@/server/api/trpc";
import { testDb } from "@/test/db";
import { findKeyPaths } from "@/test/deepKeys";
import {
	makeCourse,
	makeEnrollment,
	makeLesson,
	makeQuiz,
	makeQuizAttempt,
	makeSection,
	makeUser,
} from "@/test/factories";
import { quizRouter } from "./quiz";

const createCaller = createCallerFactory(quizRouter);

const ctxFor = (userId: string) =>
	({
		db: testDb,
		headers: new Headers(),
		session: {
			user: { id: userId, role: Role.STUDENT },
			session: { id: "s1" },
		},
	}) as never;

/**
 * The response as the client actually receives it. Asserting on the service's
 * return value would miss a key that only appears once superjson has walked the
 * object graph.
 */
const serialised = (result: unknown): unknown =>
	SuperJSON.parse(SuperJSON.stringify(result));

describe("quiz.getByLesson never carries the answer key", () => {
	let caller: ReturnType<typeof createCaller>;
	let lessonId: string;
	let studentId: string;

	beforeEach(async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser();
		const course = await makeCourse({ instructorId: instructor.id });
		const section = await makeSection({ courseId: course.id });
		const lesson = await makeLesson({ sectionId: section.id });
		await makeEnrollment({ studentId: student.id, courseId: course.id });
		lessonId = lesson.id;
		studentId = student.id;
		caller = createCaller(ctxFor(student.id));
	});

	it("returns the questions without the key", async () => {
		await makeQuiz({ lessonId, correct: "SENTINEL" });

		const result = await caller.getByLesson(lessonId);

		expect(findKeyPaths(serialised(result), "correct")).toEqual([]);
		expect(JSON.stringify(result)).not.toContain("SENTINEL");
	});

	// The service pairs quizzes[i] with attempts[i] positionally, so ids that do
	// not sort in creation order are the case a narrowing change can break: a
	// student would be shown someone else's attempt state on their own quiz.
	it("still gives each quiz its own attempt", async () => {
		await makeQuiz({ lessonId, id: "quiz-c", question: "c" });
		await makeQuiz({ lessonId, id: "quiz-a", question: "a" });
		await makeQuiz({ lessonId, id: "quiz-b", question: "b" });
		await makeQuizAttempt({
			quizId: "quiz-b",
			studentId,
			selectedAnswer: "B-answer",
			isCorrect: true,
		});

		const result = await caller.getByLesson(lessonId);

		expect(
			result?.map((q) => [q.id, q.attempt?.selectedAnswer ?? null]),
		).toEqual([
			["quiz-a", null],
			["quiz-b", "B-answer"],
			["quiz-c", null],
		]);
	});
});

describe("quiz.submit never carries the answer key", () => {
	let caller: ReturnType<typeof createCaller>;
	let quizId: string;

	beforeEach(async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser();
		const course = await makeCourse({ instructorId: instructor.id });
		const section = await makeSection({ courseId: course.id });
		const lesson = await makeLesson({ sectionId: section.id });
		await makeEnrollment({ studentId: student.id, courseId: course.id });
		const quiz = await makeQuiz({
			lessonId: lesson.id,
			options: ["A", "B", "C", "D"],
			correct: "D",
		});
		quizId = quiz.id;
		caller = createCaller(ctxFor(student.id));
	});

	it("says nothing about the key on a wrong answer", async () => {
		const result = await caller.submit({ quizId, selectedAnswer: "A" });

		expect(findKeyPaths(serialised(result), "correct")).toEqual([]);
	});

	it("says nothing about the key on a correct answer", async () => {
		const result = await caller.submit({ quizId, selectedAnswer: "D" });

		expect(findKeyPaths(serialised(result), "correct")).toEqual([]);
	});

	it("says nothing about the key when the cap is spent", async () => {
		await caller.submit({ quizId, selectedAnswer: "A" });
		await caller.submit({ quizId, selectedAnswer: "B" });
		await caller.submit({ quizId, selectedAnswer: "C" });

		const error = await caller
			.submit({ quizId, selectedAnswer: "D" })
			.catch((e: unknown) => e);

		expect(findKeyPaths(serialised(error), "correct")).toEqual([]);
		// The message, not JSON.stringify(error): a TRPCError's message is
		// non-enumerable, so stringifying it yields "{}" and asserts nothing.
		expect((error as { message: string }).message).not.toContain("D");
	});

	it("says nothing about the key when the question is already answered", async () => {
		await caller.submit({ quizId, selectedAnswer: "D" });

		const error = await caller
			.submit({ quizId, selectedAnswer: "A" })
			.catch((e: unknown) => e);

		expect(findKeyPaths(serialised(error), "correct")).toEqual([]);
	});

	it("still lets a wrong answer inside the cap be retried", async () => {
		await caller.submit({ quizId, selectedAnswer: "A" });

		const second = await caller.submit({ quizId, selectedAnswer: "D" });

		expect(second).toMatchObject({ isCorrect: true, attemptCount: 2 });
		expect(findKeyPaths(serialised(second), "correct")).toEqual([]);
	});
});
