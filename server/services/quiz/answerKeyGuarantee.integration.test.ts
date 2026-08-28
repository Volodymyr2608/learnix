// Set NODE_ENV to production so the timing middleware skips the artificial delay
Object.assign(process.env, { NODE_ENV: "production" });

import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@/generated/prisma";
import { createCaller } from "@/server/api/root";
import { testDb } from "@/test/db";
import { findKeyPaths } from "@/test/deepKeys";
import {
	makeCourse,
	makeEnrollment,
	makeLesson,
	makeLessonInsights,
	makeQuiz,
	makeSection,
	makeUser,
} from "@/test/factories";

/**
 * The claim the whole feature exists to make true, tested as one story rather
 * than as parts: a student who does not know the answers cannot reach level 3.
 *
 * Both halves are load-bearing and neither is sufficient. Removing the key alone
 * turns one read into a three-request enumeration; capping alone leaves the key
 * in the response. This test fails if either is undone.
 */
describe("level 3 requires knowledge, not enumeration", () => {
	const OPTIONS = ["A", "B", "C", "D"];
	// The option the cap denies. min(3, 4 - 1) = 3 attempts against 4 options, so
	// an attacker trying them in order never reaches this one.
	const CORRECT = "D";

	let caller: ReturnType<typeof createCaller>;
	let studentId: string;
	let lessonId: string;
	let quizIds: string[];

	beforeEach(async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser();
		const course = await makeCourse({ instructorId: instructor.id });
		const section = await makeSection({ courseId: course.id });
		const lesson = await makeLesson({ sectionId: section.id });
		await makeEnrollment({ studentId: student.id, courseId: course.id });
		await makeLessonInsights({ lessonId: lesson.id });
		const quizzes = await Promise.all([
			makeQuiz({ lessonId: lesson.id, options: OPTIONS, correct: CORRECT }),
			makeQuiz({ lessonId: lesson.id, options: OPTIONS, correct: CORRECT }),
			makeQuiz({ lessonId: lesson.id, options: OPTIONS, correct: CORRECT }),
		]);

		studentId = student.id;
		lessonId = lesson.id;
		quizIds = quizzes.map((q) => q.id);
		caller = createCaller({
			db: testDb,
			headers: new Headers(),
			session: {
				user: { id: student.id, role: Role.STUDENT },
				session: { id: "s1" },
			},
		} as never);
	});

	it("gives an attacker who reads everything and guesses everything no level 3", async () => {
		// 1. Read every response the lesson offers a student.
		const reads = [
			await caller.quiz.getByLesson(lessonId),
			await caller.lesson.getStudentLesson(lessonId),
		];
		// Key presence, not text: the correct option is "D", which is also one of
		// the four options every response legitimately carries.
		expect(reads.flatMap((r) => findKeyPaths(r, "correct"))).toEqual([]);

		// 2. Spend every attempt the cap allows, on every quiz, in option order.
		const refusals: unknown[] = [];
		for (const quizId of quizIds) {
			for (const selectedAnswer of OPTIONS) {
				await caller.quiz
					.submit({ quizId, selectedAnswer })
					.catch((error: unknown) => refusals.push(error));
			}
		}

		// 3. Nothing was answered correctly, and nothing was promoted.
		const attempts = await testDb.quizAttempt.findMany({
			where: { studentId },
		});
		const mastery = await testDb.conceptMastery.findMany({
			where: { studentId },
		});
		expect(attempts).toHaveLength(3);
		expect(attempts.every((a) => a.isCorrect)).toBe(false);
		expect(attempts.map((a) => a.attemptCount)).toEqual([3, 3, 3]);
		expect(refusals).toHaveLength(3);
		expect(mastery).toHaveLength(0);
		// Twelve submissions through the full tRPC stack: given a generous timeout
		// so a slow machine reports the guarantee, not the clock.
	}, 30_000);

	it("still gives level 3 to a student who knows the answers", async () => {
		for (const quizId of quizIds) {
			await caller.quiz.submit({ quizId, selectedAnswer: CORRECT });
		}

		const mastery = await testDb.conceptMastery.findMany({
			where: { studentId },
		});
		expect(mastery.map((row) => [row.level, row.evidence])).toEqual([
			[3, "QUIZ_FIRST_PASS"],
		]);
	});
});
