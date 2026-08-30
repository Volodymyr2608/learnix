import { TRPCError } from "@trpc/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { appRouter } from "@/server/api/root";
import { conceptCheckService } from "@/server/services/conceptCheck/conceptCheck.service";
import { testDb, truncateAll } from "@/test/db";
import { findKeyPaths } from "@/test/deepKeys";
import {
	makeCourse,
	makeEnrollment,
	makeLesson,
	makeSection,
	makeUser,
} from "@/test/factories";

const authored = {
	concept: "Recursion",
	question: "Which call ends a recursive descent?",
	options: [
		"The base case",
		"The first recursive call",
		"The outermost frame",
		"The largest input",
	],
	correctOption: "The base case",
};

const callerFor = (userId: string) =>
	appRouter.createCaller({
		session: { user: { id: userId, role: "STUDENT" } },
		headers: new Headers(),
	} as unknown as Parameters<typeof appRouter.createCaller>[0]);

describe("lessonAssistant concept-check procedures", () => {
	let studentId: string;
	let intruderId: string;
	let lessonId: string;

	beforeEach(async () => {
		await truncateAll();
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		const student = await makeUser();
		const intruder = await makeUser();
		const course = await makeCourse({ instructorId: instructor.id });
		const section = await makeSection({ courseId: course.id });
		const lesson = await makeLesson({ sectionId: section.id });
		await makeEnrollment({ studentId: student.id, courseId: course.id });
		await makeEnrollment({ studentId: intruder.id, courseId: course.id });

		studentId = student.id;
		intruderId = intruder.id;
		lessonId = lesson.id;
	});

	afterAll(async () => {
		await testDb.$disconnect();
	});

	const issue = () =>
		conceptCheckService.issue({ studentId, lessonId, ...authored });

	it("returns the open check without its answer key", async () => {
		const check = await issue();

		const found = await callerFor(studentId).lessonAssistant.pendingCheck({
			lessonId,
		});

		expect(found?.id).toBe(check.id);
		expect(findKeyPaths(found, "correct")).toEqual([]);
	});

	it("shows one student nothing of another's open check", async () => {
		await issue();

		await expect(
			callerFor(intruderId).lessonAssistant.pendingCheck({ lessonId }),
		).resolves.toBeNull();
	});

	it("returns null when no check is open", async () => {
		await expect(
			callerFor(studentId).lessonAssistant.pendingCheck({ lessonId }),
		).resolves.toBeNull();
	});

	it("grades the owner's own answer and returns the key once", async () => {
		const check = await issue();
		const index = check.options.indexOf(authored.correctOption);

		const result = await callerFor(
			studentId,
		).lessonAssistant.answerConceptCheck({
			checkId: check.id,
			optionIndex: index,
		});

		expect(result).toEqual({
			isCorrect: true,
			correctOption: authored.correctOption,
		});
	});

	it("rejects a cross-student checkId and changes nothing", async () => {
		const check = await issue();

		await expect(
			callerFor(intruderId).lessonAssistant.answerConceptCheck({
				checkId: check.id,
				optionIndex: 0,
			}),
		).rejects.toBeInstanceOf(TRPCError);

		const stored = await testDb.conceptCheck.findUniqueOrThrow({
			where: { id: check.id },
		});
		expect(stored.status).toBe("PENDING");
		expect(stored.answeredAt).toBeNull();
		await expect(testDb.conceptMastery.count()).resolves.toBe(0);
	});

	it("says the same thing about a foreign check and an absent one", async () => {
		const check = await issue();

		const errors: string[] = [];
		for (const checkId of [check.id, "no-such-check"]) {
			try {
				await callerFor(intruderId).lessonAssistant.answerConceptCheck({
					checkId,
					optionIndex: 0,
				});
			} catch (error) {
				errors.push((error as TRPCError).message);
			}
		}

		expect(errors).toHaveLength(2);
		expect(errors[0]).toBe(errors[1]);
	});

	/**
	 * `clearHistory` is client-callable. If it took the open check with it, a
	 * student could clear the thread to escape a question they were about to get
	 * wrong — and the per-concept budget would reset with it.
	 */
	it("leaves a pending check intact when the thread is cleared", async () => {
		const check = await issue();

		await callerFor(studentId).lessonAssistant.clearHistory({ lessonId });

		await expect(
			callerFor(studentId).lessonAssistant.pendingCheck({ lessonId }),
		).resolves.toMatchObject({ id: check.id });
	});
});
