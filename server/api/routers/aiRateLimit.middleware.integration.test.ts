// Set NODE_ENV to production so the timing middleware skips the artificial delay
Object.assign(process.env, { NODE_ENV: "production" });

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@/generated/prisma";
import { createCallerFactory } from "@/server/api/trpc";
import {
	__featureCountForTest,
	__resetWindowsForTest,
} from "@/server/services/_shared/aiLimits/checkAiRateLimit";
import { __windowSizeForTest } from "@/server/services/_shared/aiLimits/store/memory.store";
import { testDb, truncateAll } from "@/test/db";
import {
	makeCourse,
	makeLesson,
	makeSection,
	makeUser,
} from "@/test/factories";
import { quizRouter } from "./quiz";

const { mockGenerate } = vi.hoisted(() => ({ mockGenerate: vi.fn() }));

vi.mock("@/server/services/quizAI/quizAI.service", async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return {
		...actual,
		quizAIService: { generateForLesson: mockGenerate },
	};
});

const createCaller = createCallerFactory(quizRouter);

const ctxFor = (userId: string, role: Role) =>
	({
		db: testDb,
		headers: new Headers(),
		session: { user: { id: userId, role }, session: { id: "s1" } },
	}) as never;

const seedLesson = async () => {
	const instructor = await makeUser({ role: Role.INSTRUCTOR });
	const course = await makeCourse({ instructorId: instructor.id });
	const section = await makeSection({ courseId: course.id });
	const lesson = await makeLesson({ sectionId: section.id });
	return { instructor, lesson };
};

beforeEach(async () => {
	await __resetWindowsForTest();
	mockGenerate.mockReset();
	mockGenerate.mockResolvedValue([]);
});

afterEach(() => truncateAll());

describe("aiRateLimit middleware ordering (AC 34, 36, 37)", () => {
	it("a STUDENT still gets FORBIDDEN, not TOO_MANY_REQUESTS", async () => {
		const student = await makeUser({ role: Role.STUDENT });
		const { lesson } = await seedLesson();

		await expect(
			createCaller(ctxFor(student.id, Role.STUDENT)).generateAI({
				lessonId: lesson.id,
				count: 3,
				regenerate: false,
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("a rejected role check never reaches the limiter", async () => {
		const student = await makeUser({ role: Role.STUDENT });
		const { lesson } = await seedLesson();

		await createCaller(ctxFor(student.id, Role.STUDENT))
			.generateAI({ lessonId: lesson.id, count: 3, regenerate: false })
			.catch(() => undefined);

		expect(__windowSizeForTest()).toBe(0);
	});

	it("an instructor's call spends that instructor's quizAI window", async () => {
		const { instructor, lesson } = await seedLesson();

		await createCaller(ctxFor(instructor.id, Role.INSTRUCTOR)).generateAI({
			lessonId: lesson.id,
			count: 3,
			regenerate: false,
		});

		await expect(__featureCountForTest(instructor.id, "quizAI")).resolves.toBe(
			1,
		);
		expect(mockGenerate).toHaveBeenCalled();
	});

	it("exhausting the quizAI ceiling yields TOO_MANY_REQUESTS with a fixed message", async () => {
		const { instructor, lesson } = await seedLesson();
		const caller = createCaller(ctxFor(instructor.id, Role.INSTRUCTOR));
		const input = { lessonId: lesson.id, count: 3, regenerate: false };

		for (let i = 0; i < 10; i++) await caller.generateAI(input);

		await expect(caller.generateAI(input)).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			message: "Too many AI requests — please try again shortly.",
		});
	});
});
