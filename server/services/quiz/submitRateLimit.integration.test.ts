// Set NODE_ENV to production so the timing middleware skips the artificial delay
Object.assign(process.env, { NODE_ENV: "production" });

import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@/generated/prisma";
import { quizRouter } from "@/server/api/routers/quiz";
import { createCallerFactory } from "@/server/api/trpc";
import {
	__aggregateCountForTest,
	__featureCountForTest,
	__resetWindowsForTest,
} from "@/server/services/_shared/aiLimits/checkAiRateLimit";
import { MAX_SUBMITS_PER_WINDOW } from "@/server/services/_shared/aiLimits/checkQuizSubmitRateLimit";
import { testDb } from "@/test/db";
import {
	makeCourse,
	makeEnrollment,
	makeLesson,
	makeQuiz,
	makeSection,
	makeUser,
} from "@/test/factories";

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

describe("quiz.submit rate limit", () => {
	let caller: ReturnType<typeof createCaller>;
	let studentId: string;
	let quizId: string;
	let otherQuizId: string;

	beforeEach(async () => {
		await __resetWindowsForTest();
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
		const other = await makeQuiz({
			lessonId: lesson.id,
			options: ["A", "B", "C", "D"],
			correct: "D",
		});
		studentId = student.id;
		quizId = quiz.id;
		otherQuizId = other.id;
		caller = createCaller(ctxFor(student.id));
	});

	const submitTimes = async (id: string, times: number) => {
		for (let i = 0; i < times; i++) {
			await caller.submit({ quizId: id, selectedAnswer: "A" }).catch(() => {});
		}
	};

	it("rejects the submission past the window, and records nothing for it", async () => {
		await submitTimes(quizId, MAX_SUBMITS_PER_WINDOW);
		const before = await testDb.quizAttempt.findFirstOrThrow({
			where: { quizId, studentId },
		});

		const error = await caller
			.submit({ quizId, selectedAnswer: "B" })
			.catch((e: unknown) => e);

		const after = await testDb.quizAttempt.findFirstOrThrow({
			where: { quizId, studentId },
		});
		expect(error).toMatchObject({
			code: "TOO_MANY_REQUESTS",
			message: expect.stringMatching(/too many submissions/i),
		});
		expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
		expect(after.attemptCount).toBe(before.attemptCount);
	});

	it("leaves another quiz's window alone", async () => {
		await submitTimes(quizId, MAX_SUBMITS_PER_WINDOW + 1);

		const attempt = await caller.submit({
			quizId: otherQuizId,
			selectedAnswer: "D",
		});

		expect(attempt).toMatchObject({ isCorrect: true, attemptCount: 1 });
	});

	it("spends none of the student's AI allowance", async () => {
		await submitTimes(quizId, MAX_SUBMITS_PER_WINDOW + 1);

		expect(await __aggregateCountForTest(studentId)).toBe(0);
		expect(await __featureCountForTest(studentId, "lessonAI")).toBe(0);
	});
});
