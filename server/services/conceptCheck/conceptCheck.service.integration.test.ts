import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ConceptCheckStatus, EnrollmentStatus } from "@/generated/prisma";
import { conceptKey } from "@/server/services/_shared/concepts/conceptKey";
import {
	CheckAlreadyPendingError,
	CheckBudgetSpentError,
	ConceptCheckForbiddenError,
} from "@/server/services/conceptCheck/conceptCheck.errors";
import { conceptCheckService } from "@/server/services/conceptCheck/conceptCheck.service";
import { CONVERSATION_MAX_LEVEL } from "@/server/services/mastery/masteryLevels";
import { testDb, truncateAll } from "@/test/db";
import {
	makeConceptMastery,
	makeCourse,
	makeEnrollment,
	makeLesson,
	makeSection,
	makeUser,
} from "@/test/factories";

const CONCEPT = "API Routes";
const HOUR = 60 * 60 * 1000;

const authored = {
	concept: CONCEPT,
	question: "Which file exports a route handler?",
	options: ["route.ts", "page.tsx", "layout.tsx", "loading.tsx"],
	correctOption: "route.ts",
};

type Seed = {
	studentId: string;
	courseId: string;
	lessonId: string;
	otherLessonId: string;
};

const seed = async ({ enrolled = true } = {}): Promise<Seed> => {
	const instructor = await makeUser();
	const student = await makeUser();
	const course = await makeCourse({ instructorId: instructor.id });
	const section = await makeSection({ courseId: course.id });
	const lesson = await makeLesson({ sectionId: section.id });
	const otherLesson = await makeLesson({ sectionId: section.id, order: 1 });

	if (enrolled) {
		await makeEnrollment({ studentId: student.id, courseId: course.id });
	}

	return {
		studentId: student.id,
		courseId: course.id,
		lessonId: lesson.id,
		otherLessonId: otherLesson.id,
	};
};

const issue = (s: Seed, overrides: Partial<typeof authored> = {}) =>
	conceptCheckService.issue({
		studentId: s.studentId,
		lessonId: s.lessonId,
		...authored,
		...overrides,
	});

/** A closed check in the past, as the budget and the cooldown will read it. */
const answeredCheck = (
	s: Seed,
	{ isCorrect, hoursAgo }: { isCorrect: boolean; hoursAgo: number },
) =>
	testDb.conceptCheck.create({
		data: {
			studentId: s.studentId,
			lessonId: s.lessonId,
			courseId: s.courseId,
			concept: CONCEPT,
			conceptKey: conceptKey(CONCEPT),
			question: authored.question,
			options: authored.options,
			correct: authored.correctOption,
			status: ConceptCheckStatus.ANSWERED,
			selectedAnswer: isCorrect ? "route.ts" : "page.tsx",
			isCorrect,
			expiresAt: new Date(Date.now() - hoursAgo * HOUR + 30 * 60 * 1000),
			answeredAt: new Date(Date.now() - hoursAgo * HOUR),
		},
	});

describe("conceptCheckService.issue", () => {
	beforeEach(async () => {
		await truncateAll();
	});

	afterAll(async () => {
		await testDb.$disconnect();
	});

	it("persists a check the student can answer, without handing back the key", async () => {
		const s = await seed();

		const issued = await issue(s);

		expect(issued).toMatchObject({
			lessonId: s.lessonId,
			concept: CONCEPT,
			question: authored.question,
		});
		expect(Object.keys(issued)).not.toContain("correct");

		const stored = await testDb.conceptCheck.findUniqueOrThrow({
			where: { id: issued.id },
		});
		expect(stored.status).toBe(ConceptCheckStatus.PENDING);
		expect(stored.correct).toBe("route.ts");
		expect(stored.conceptKey).toBe(conceptKey(CONCEPT));
		expect(stored.courseId).toBe(s.courseId);
		expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now());
		expect([...stored.options].sort()).toEqual([...authored.options].sort());
	});

	it("creates nothing for a lesson the student is not enrolled in", async () => {
		const s = await seed({ enrolled: false });

		await expect(issue(s)).rejects.toBeInstanceOf(ConceptCheckForbiddenError);
		await expect(testDb.conceptCheck.count()).resolves.toBe(0);
	});

	it("creates nothing once the enrollment is cancelled", async () => {
		const s = await seed();
		await testDb.enrollment.updateMany({
			where: { studentId: s.studentId, courseId: s.courseId },
			data: { status: EnrollmentStatus.cancelled },
		});

		await expect(issue(s)).rejects.toBeInstanceOf(ConceptCheckForbiddenError);
		await expect(testDb.conceptCheck.count()).resolves.toBe(0);
	});

	it("refuses a second check while one is open on the lesson", async () => {
		const s = await seed();
		await issue(s);

		await expect(
			issue(s, { concept: "Server Components" }),
		).rejects.toBeInstanceOf(CheckAlreadyPendingError);
		await expect(testDb.conceptCheck.count()).resolves.toBe(1);
	});

	it("sweeps an abandoned check so it cannot hold the lesson's slot forever", async () => {
		const s = await seed();
		const stale = await issue(s);
		await testDb.conceptCheck.update({
			where: { id: stale.id },
			data: { expiresAt: new Date(Date.now() - 1000) },
		});

		const fresh = await issue(s);

		expect(fresh.id).not.toBe(stale.id);
		const sweptRow = await testDb.conceptCheck.findUniqueOrThrow({
			where: { id: stale.id },
		});
		expect(sweptRow.status).toBe(ConceptCheckStatus.EXPIRED);
		expect(sweptRow.answeredAt).toBeNull();
	});

	it("refuses a fourth check on the same concept", async () => {
		const s = await seed();
		for (const hoursAgo of [72, 60, 48]) {
			await answeredCheck(s, { isCorrect: false, hoursAgo });
		}

		await expect(issue(s)).rejects.toBeInstanceOf(CheckBudgetSpentError);
		await expect(
			testDb.conceptCheck.count({ where: { status: "PENDING" } }),
		).resolves.toBe(0);
	});

	it("counts the budget per concept, not per student", async () => {
		const s = await seed();
		for (const hoursAgo of [72, 60, 48]) {
			await answeredCheck(s, { isCorrect: false, hoursAgo });
		}

		await expect(
			issue(s, { concept: "Server Components" }),
		).resolves.toBeTruthy();
	});

	it("refuses a retry 19 hours after a wrong answer", async () => {
		const s = await seed();
		await answeredCheck(s, { isCorrect: false, hoursAgo: 19 });

		await expect(issue(s)).rejects.toBeInstanceOf(CheckBudgetSpentError);
	});

	it("allows a retry 25 hours after a wrong answer", async () => {
		const s = await seed();
		await answeredCheck(s, { isCorrect: false, hoursAgo: 25 });

		await expect(issue(s)).resolves.toBeTruthy();
	});

	it("refuses a concept the student has already earned evidence for", async () => {
		const s = await seed();
		await makeConceptMastery({
			studentId: s.studentId,
			courseId: s.courseId,
			concept: "api  routes",
			level: CONVERSATION_MAX_LEVEL,
		});

		await expect(issue(s)).rejects.toBeInstanceOf(CheckBudgetSpentError);
	});

	it("still issues when the concept sits below the conversation ceiling", async () => {
		const s = await seed();
		await makeConceptMastery({
			studentId: s.studentId,
			courseId: s.courseId,
			concept: CONCEPT,
			level: CONVERSATION_MAX_LEVEL - 1,
		});

		await expect(issue(s)).resolves.toBeTruthy();
	});
});
