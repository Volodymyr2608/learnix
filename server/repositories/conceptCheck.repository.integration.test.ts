import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ConceptCheckStatus } from "@/generated/prisma";
import { conceptKey } from "@/server/services/_shared/concepts/conceptKey";
import { testDb, truncateAll } from "@/test/db";
import {
	makeCourse,
	makeLesson,
	makeSection,
	makeUser,
} from "@/test/factories";

/**
 * The partial unique index lives only in a migration file — Prisma cannot
 * express `WHERE status = 'PENDING'`, so `prisma db push` and `prisma migrate
 * dev` are both capable of removing it silently. It is pinned twice on purpose:
 * once as an object (catches a migration that drops it) and once behaviourally
 * (catches a "helpful" re-creation without the predicate, which a plain unique
 * index would pass the first half of).
 */
const INDEX_NAME = "concept_checks_one_pending_per_lesson";

const CONCEPT = "API Routes";

type Seed = {
	studentId: string;
	otherStudentId: string;
	courseId: string;
	lessonId: string;
	otherLessonId: string;
};

const seed = async (): Promise<Seed> => {
	const instructor = await makeUser();
	const student = await makeUser();
	const otherStudent = await makeUser();
	const course = await makeCourse({ instructorId: instructor.id });
	const section = await makeSection({ courseId: course.id });
	const lesson = await makeLesson({ sectionId: section.id });
	const otherLesson = await makeLesson({ sectionId: section.id, order: 1 });

	return {
		studentId: student.id,
		otherStudentId: otherStudent.id,
		courseId: course.id,
		lessonId: lesson.id,
		otherLessonId: otherLesson.id,
	};
};

const insertPending = (s: Seed, overrides: Record<string, unknown> = {}) =>
	testDb.conceptCheck.create({
		data: {
			studentId: s.studentId,
			lessonId: s.lessonId,
			courseId: s.courseId,
			concept: CONCEPT,
			conceptKey: conceptKey(CONCEPT),
			question: "Which file exports a route handler?",
			options: ["route.ts", "page.tsx", "layout.tsx", "loading.tsx"],
			correct: "route.ts",
			expiresAt: new Date(Date.now() + 60 * 60 * 1000),
			...overrides,
		},
	});

describe("concept_checks — one open check per lesson", () => {
	beforeEach(async () => {
		await truncateAll();
	});

	afterAll(async () => {
		await testDb.$disconnect();
	});

	it("refuses a second PENDING check for the same student and lesson", async () => {
		const s = await seed();
		await insertPending(s);

		await expect(insertPending(s)).rejects.toMatchObject({ code: "P2002" });
	});

	it("allows a third check once the first is answered", async () => {
		const s = await seed();
		const first = await insertPending(s);

		await testDb.conceptCheck.update({
			where: { id: first.id },
			data: {
				status: ConceptCheckStatus.ANSWERED,
				answeredAt: new Date(),
				isCorrect: true,
				selectedAnswer: "route.ts",
			},
		});

		await expect(insertPending(s)).resolves.toMatchObject({
			status: ConceptCheckStatus.PENDING,
		});
	});

	it("allows a second PENDING check once the first is swept to EXPIRED", async () => {
		const s = await seed();
		const first = await insertPending(s);

		await testDb.conceptCheck.update({
			where: { id: first.id },
			data: { status: ConceptCheckStatus.EXPIRED },
		});

		await expect(insertPending(s)).resolves.toMatchObject({
			status: ConceptCheckStatus.PENDING,
		});
	});

	it("scopes the one-open rule per student and per lesson", async () => {
		const s = await seed();
		await insertPending(s);

		await expect(
			insertPending(s, { studentId: s.otherStudentId }),
		).resolves.toBeTruthy();
		await expect(
			insertPending(s, { lessonId: s.otherLessonId }),
		).resolves.toBeTruthy();
	});

	it("carries the partial unique index with its PENDING predicate", async () => {
		const rows = await testDb.$queryRaw<{ indexdef: string }[]>`
			SELECT indexdef FROM pg_indexes
			WHERE tablename = 'concept_checks' AND indexname = ${INDEX_NAME}
		`;

		expect(rows).toHaveLength(1);
		const indexdef = rows[0]?.indexdef ?? "";
		expect(indexdef).toContain("CREATE UNIQUE INDEX");
		expect(indexdef).toContain(`"studentId"`);
		expect(indexdef).toContain(`"lessonId"`);
		expect(indexdef).toMatch(/WHERE \(status = 'PENDING'/);
	});
});
