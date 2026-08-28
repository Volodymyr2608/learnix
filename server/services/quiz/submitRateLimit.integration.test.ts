// Set NODE_ENV to production so the timing middleware skips the artificial delay
Object.assign(process.env, { NODE_ENV: "production" });

import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@/generated/prisma";
import { quizRouter } from "@/server/api/routers/quiz";
import { createCallerFactory } from "@/server/api/trpc";
import { shouldReport } from "@/server/observability/shouldReport";
import {
	__aggregateCountForTest,
	__featureCountForTest,
	__resetWindowsForTest,
} from "@/server/services/_shared/aiLimits/checkAiRateLimit";
import {
	MAX_SUBMITS_PER_USER_WINDOW,
	MAX_SUBMITS_PER_WINDOW,
} from "@/server/services/_shared/aiLimits/checkQuizSubmitRateLimit";
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

	// The per-quiz window alone bounds nothing: quizId comes from the request, so
	// a caller sweeping made-up ids gets a fresh budget every time. The ids here
	// do not exist, which is exactly the cheap request a script would send.
	it("refuses a caller sweeping distinct quiz ids once the per-user ceiling is spent", async () => {
		const results: unknown[] = [];
		for (let i = 0; i < MAX_SUBMITS_PER_USER_WINDOW + 1; i++) {
			await caller
				.submit({ quizId: `c${i}${"x".repeat(23)}`, selectedAnswer: "A" })
				.catch((error: unknown) => results.push(error));
		}

		const last = results.at(-1);
		expect(results).toHaveLength(MAX_SUBMITS_PER_USER_WINDOW + 1);
		expect(last).toMatchObject({
			code: "TOO_MANY_REQUESTS",
			message: expect.stringMatching(/too many submissions/i),
		});
	}, 30_000);

	// A made-up id is the caller's mistake, not ours. As an INTERNAL_SERVER_ERROR
	// every one of those requests was reported to Sentry, so a client sweeping ids
	// could burn the monthly quota that every real failure has to fit inside.
	it("answers an unknown quiz id as a client fault, not as a server failure", async () => {
		const error = await caller
			.submit({ quizId: `c${"y".repeat(24)}`, selectedAnswer: "A" })
			.catch((e: unknown) => e);

		expect(error).toMatchObject({ code: "NOT_FOUND" });
		expect(shouldReport(error)).toBe(false);
	});

	it("spends none of the student's AI allowance", async () => {
		await submitTimes(quizId, MAX_SUBMITS_PER_WINDOW + 1);

		expect(await __aggregateCountForTest(studentId)).toBe(0);
		expect(await __featureCountForTest(studentId, "lessonAI")).toBe(0);
	});
});
