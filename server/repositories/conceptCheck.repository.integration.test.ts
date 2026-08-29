import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ConceptCheckStatus } from "@/generated/prisma";
import { conceptCheckRepository } from "@/server/repositories/conceptCheck.repository";
import { conceptKey } from "@/server/services/_shared/concepts/conceptKey";
import { testDb, truncateAll } from "@/test/db";
import { findKeyPaths } from "@/test/deepKeys";
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

/**
 * The answer key leaves the server through exactly one door. Every method the
 * repository owns must be listed on one side of this split, so that adding a
 * read without deciding which side it belongs to fails here rather than in
 * review.
 */
const ANSWER_KEY_DOORS: string[] = [
	"claimForAnswer",
	// Plumbing, but classified here because its payload is whatever the callback
	// returns — and the callback that matters is the claim.
	"runAtomically",
];

const READ_DOORS = [
	"findPendingPublic",
	"countForConcept",
	"lastWrongAnsweredAt",
	"insertSweepingExpired",
];

describe("conceptCheckRepository.findPendingPublic", () => {
	beforeEach(async () => {
		await truncateAll();
	});

	afterAll(async () => {
		await testDb.$disconnect();
	});

	it("returns the open check without its answer key", async () => {
		const s = await seed();
		const created = await insertPending(s);

		const found = await conceptCheckRepository.findPendingPublic(
			s.studentId,
			s.lessonId,
		);

		expect(found).toMatchObject({
			id: created.id,
			concept: CONCEPT,
			question: "Which file exports a route handler?",
		});
		expect(found?.options).toHaveLength(4);
		// Key presence, not value: `expect(found.correct).toBeUndefined()` passes
		// just as well when the field is loaded and happens to be empty.
		expect(findKeyPaths(found, "correct")).toEqual([]);
		expect(Object.keys(found ?? {})).not.toContain("correct");
	});

	it("returns null for another student's open check", async () => {
		const s = await seed();
		await insertPending(s);

		await expect(
			conceptCheckRepository.findPendingPublic(s.otherStudentId, s.lessonId),
		).resolves.toBeNull();
	});

	it("returns null once the check is answered", async () => {
		const s = await seed();
		const created = await insertPending(s);
		await testDb.conceptCheck.update({
			where: { id: created.id },
			data: { status: ConceptCheckStatus.ANSWERED, answeredAt: new Date() },
		});

		await expect(
			conceptCheckRepository.findPendingPublic(s.studentId, s.lessonId),
		).resolves.toBeNull();
	});

	it("never returns a check whose expiry has passed, swept or not", async () => {
		const s = await seed();
		await insertPending(s, { expiresAt: new Date(Date.now() - 1000) });

		await expect(
			conceptCheckRepository.findPendingPublic(s.studentId, s.lessonId),
		).resolves.toBeNull();
	});

	it("classifies every method it owns as a read door or an answer-key door", () => {
		const owned = Object.getOwnPropertyNames(
			Object.getPrototypeOf(conceptCheckRepository),
		).filter((name) => name !== "constructor");

		expect([...owned].sort()).toEqual(
			[...READ_DOORS, ...ANSWER_KEY_DOORS].sort(),
		);
	});
});

describe("conceptCheckRepository.claimForAnswer", () => {
	beforeEach(async () => {
		await truncateAll();
	});

	afterAll(async () => {
		await testDb.$disconnect();
	});

	it("claims an open check once and never again", async () => {
		const s = await seed();
		const created = await insertPending(s);

		const claimed = await conceptCheckRepository.claimForAnswer(
			created.id,
			s.studentId,
		);
		expect(claimed).toMatchObject({
			id: created.id,
			status: ConceptCheckStatus.ANSWERED,
		});

		await expect(
			conceptCheckRepository.claimForAnswer(created.id, s.studentId),
		).resolves.toBeNull();
	});

	it("hands the answer key to the claim, the one door that carries it", async () => {
		const s = await seed();
		const created = await insertPending(s);

		const claimed = await conceptCheckRepository.claimForAnswer(
			created.id,
			s.studentId,
		);

		// The grader compares option text, so the claim must return it. This is
		// the single channel the key leaves through, and it is reached only by the
		// student who owns the row, exactly once.
		expect(claimed?.correct).toBe("route.ts");
	});

	it("refuses an expired check and leaves it PENDING", async () => {
		const s = await seed();
		const created = await insertPending(s, {
			expiresAt: new Date(Date.now() - 1000),
		});

		await expect(
			conceptCheckRepository.claimForAnswer(created.id, s.studentId),
		).resolves.toBeNull();

		const after = await testDb.conceptCheck.findUniqueOrThrow({
			where: { id: created.id },
		});
		expect(after.status).toBe(ConceptCheckStatus.PENDING);
	});

	it("refuses another student's checkId and changes nothing", async () => {
		const s = await seed();
		const created = await insertPending(s);

		await expect(
			conceptCheckRepository.claimForAnswer(created.id, s.otherStudentId),
		).resolves.toBeNull();

		const after = await testDb.conceptCheck.findUniqueOrThrow({
			where: { id: created.id },
		});
		expect(after.status).toBe(ConceptCheckStatus.PENDING);
		expect(after.answeredAt).toBeNull();
	});

	it("returns null for an id that does not exist", async () => {
		const s = await seed();

		await expect(
			conceptCheckRepository.claimForAnswer("no-such-check", s.studentId),
		).resolves.toBeNull();
	});

	it("produces exactly one winner when two claims race", async () => {
		const s = await seed();
		const created = await insertPending(s);

		const results = await Promise.all([
			conceptCheckRepository.claimForAnswer(created.id, s.studentId),
			conceptCheckRepository.claimForAnswer(created.id, s.studentId),
		]);

		// Single-use is a property of the statement: under READ COMMITTED the
		// loser re-evaluates its WHERE against the row the winner just updated and
		// matches nothing. No lock, no retry, no SELECT beforehand.
		expect(results.filter((row) => row !== null)).toHaveLength(1);
	});
});
