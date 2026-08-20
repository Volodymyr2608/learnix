// Set NODE_ENV to production so the timing middleware skips the artificial delay
Object.assign(process.env, { NODE_ENV: "production" });

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@/generated/prisma";
import { createCallerFactory } from "@/server/api/trpc";
import {
	__aggregateCountForTest,
	__featureCountForTest,
	__resetWindowsForTest,
} from "@/server/services/_shared/aiLimits/checkAiRateLimit";
import { __windowSizeForTest } from "@/server/services/_shared/aiLimits/store/memory.store";
import { testDb, truncateAll } from "@/test/db";
import {
	makeCourse,
	makeEnrollment,
	makeLesson,
	makeSection,
	makeUser,
} from "@/test/factories";
import { learningPathRouter } from "./learningPath";

// The graph is the part that costs money; the authorization decision in front of
// it is what these tests are about.
const { mockRegenerate } = vi.hoisted(() => ({ mockRegenerate: vi.fn() }));

vi.mock(
	"@/server/services/learningPathAI/learningPathAI.service",
	async (importOriginal) => {
		const actual = (await importOriginal()) as Record<string, unknown>;
		return {
			...actual,
			learningPathAIService: {
				getForCourse: vi.fn(),
				regenerate: mockRegenerate,
			},
		};
	},
);

const createCaller = createCallerFactory(learningPathRouter);

const ctxFor = (userId: string, role: Role = Role.STUDENT) =>
	({
		db: testDb,
		headers: new Headers(),
		session: { user: { id: userId, role }, session: { id: "s1" } },
	}) as never;

const seedCourse = async (title: string) => {
	const instructor = await makeUser({ role: Role.INSTRUCTOR });
	const course = await makeCourse({ instructorId: instructor.id, title });
	const section = await makeSection({ courseId: course.id });
	await makeLesson({ sectionId: section.id });
	return course;
};

beforeEach(async () => {
	await __resetWindowsForTest();
	mockRegenerate.mockReset();
	mockRegenerate.mockResolvedValue({ steps: [], summary: "ok" });
});

afterEach(() => truncateAll());

describe("learningPath.regenerate enrollment check", () => {
	it("a student not enrolled in the course gets FORBIDDEN, and nothing is generated", async () => {
		const stranger = await makeUser({ role: Role.STUDENT });
		const course = await seedCourse("Someone else's course");

		await expect(
			createCaller(ctxFor(stranger.id)).regenerate({ courseId: course.id }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });

		expect(mockRegenerate).not.toHaveBeenCalled();
		expect(
			await testDb.learningPathCache.count({ where: { courseId: course.id } }),
		).toBe(0);
	});

	it("an enrolled student reaches the service with the VERIFIED courseId", async () => {
		const student = await makeUser({ role: Role.STUDENT });
		const course = await seedCourse("Enrolled course");
		await makeEnrollment({ studentId: student.id, courseId: course.id });

		await createCaller(ctxFor(student.id)).regenerate({ courseId: course.id });

		expect(mockRegenerate).toHaveBeenCalledWith(student.id, course.id);
	});
});

describe("learningPath.regenerate rate limiting", () => {
	it("one regenerate consumes exactly one aggregate slot", async () => {
		const student = await makeUser({ role: Role.STUDENT });
		const course = await seedCourse("Enrolled course");
		await makeEnrollment({ studentId: student.id, courseId: course.id });

		await createCaller(ctxFor(student.id)).regenerate({ courseId: course.id });

		await expect(__aggregateCountForTest(student.id)).resolves.toBe(1);
	});

	it("a student enrolled in two courses can regenerate both within a minute (AC 43)", async () => {
		const student = await makeUser({ role: Role.STUDENT });
		const first = await seedCourse("First");
		const second = await seedCourse("Second");
		await makeEnrollment({ studentId: student.id, courseId: first.id });
		await makeEnrollment({ studentId: student.id, courseId: second.id });
		const caller = createCaller(ctxFor(student.id));

		await expect(
			caller.regenerate({ courseId: first.id }),
		).resolves.toBeDefined();
		await expect(
			caller.regenerate({ courseId: second.id }),
		).resolves.toBeDefined();
	});

	it("runs after the session and role checks — anonymous calls leave the map empty (AC 36)", async () => {
		const course = await seedCourse("Enrolled course");

		// Five is enough: the property is that a rejected call never reaches the
		// limiter at all, so one unauthorised entry would already fail this.
		for (let i = 0; i < 5; i++) {
			await createCaller({
				db: testDb,
				headers: new Headers(),
				session: null,
			} as never)
				.regenerate({ courseId: course.id })
				.catch(() => undefined);
		}

		expect(__windowSizeForTest()).toBe(0);
	});

	it("keys on ctx.session.user.id only — an input id cannot spend someone else's budget (AC 37)", async () => {
		const student = await makeUser({ role: Role.STUDENT });
		const victim = await makeUser({ role: Role.STUDENT });
		const course = await seedCourse("Enrolled course");
		await makeEnrollment({ studentId: student.id, courseId: course.id });

		await createCaller(ctxFor(student.id)).regenerate({
			courseId: course.id,
			// biome-ignore lint/suspicious/noExplicitAny: deliberately sending a field the DTO strips
			...({ userId: victim.id } as any),
		});

		await expect(
			__featureCountForTest(student.id, "learningPathAI"),
		).resolves.toBe(1);
		await expect(
			__featureCountForTest(victim.id, "learningPathAI"),
		).resolves.toBe(0);
	});
});
