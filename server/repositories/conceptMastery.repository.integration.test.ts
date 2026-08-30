import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { MasteryEvidence } from "@/generated/prisma";
import { conceptMasteryRepository } from "@/server/repositories/conceptMastery.repository";
import { testDb, truncateAll } from "@/test/db";
import { makeConceptMastery, makeCourse, makeUser } from "@/test/factories";

describe("conceptMasteryRepository.upsertMastery", () => {
	let studentId: string;
	let courseId: string;

	beforeEach(async () => {
		await truncateAll();
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		const student = await makeUser();
		const course = await makeCourse({ instructorId: instructor.id });
		studentId = student.id;
		courseId = course.id;
	});

	afterAll(async () => {
		await testDb.$disconnect();
	});

	it("creates the row on first write", async () => {
		await conceptMasteryRepository.upsertMastery(
			studentId,
			courseId,
			"Recursion",
			2,
			MasteryEvidence.CONVERSATION,
		);

		const row = await testDb.conceptMastery.findFirst({
			where: { studentId, concept: "Recursion" },
		});
		expect(row?.level).toBe(2);
	});

	it("raises the level", async () => {
		await conceptMasteryRepository.upsertMastery(
			studentId,
			courseId,
			"Recursion",
			2,
			MasteryEvidence.CONVERSATION,
		);
		await conceptMasteryRepository.upsertMastery(
			studentId,
			courseId,
			"Recursion",
			3,
			MasteryEvidence.QUIZ_FIRST_PASS,
		);

		const row = await testDb.conceptMastery.findFirst({
			where: { studentId, concept: "Recursion" },
		});
		expect(row?.level).toBe(3);
	});

	it("never lowers an existing level", async () => {
		// Seeded directly rather than written through the method under test, so a
		// bug that swallowed BOTH writes could not make this pass.
		await makeConceptMastery({
			studentId,
			courseId,
			concept: "Recursion",
			level: 3,
		});
		await conceptMasteryRepository.upsertMastery(
			studentId,
			courseId,
			"Recursion",
			2,
			MasteryEvidence.CONVERSATION,
		);

		const row = await testDb.conceptMastery.findFirst({
			where: { studentId, concept: "Recursion" },
		});
		expect(row?.level).toBe(3);
	});

	it("keeps one row per (student, course, concept)", async () => {
		await conceptMasteryRepository.upsertMastery(
			studentId,
			courseId,
			"Recursion",
			2,
			MasteryEvidence.CONVERSATION,
		);
		await conceptMasteryRepository.upsertMastery(
			studentId,
			courseId,
			"Recursion",
			3,
			MasteryEvidence.CONVERSATION,
		);

		const count = await testDb.conceptMastery.count({
			where: { studentId, courseId, concept: "Recursion" },
		});
		expect(count).toBe(1);
	});
});

/**
 * The shape the level-≤2 migration left behind. A `ConceptMastery` row now means
 * "this student proved this concept, and here is how" — level 2 by answering a
 * check, level 3 by passing the tagged quizzes. Levels 0 and 1 said neither: they
 * recorded exposure, which the learning path derives from completed lessons at
 * read time and does not need a durable row for.
 */
describe("a mastery row is evidence, and only levels 2 and 3 are evidence", () => {
	let studentId: string;
	let courseId: string;

	beforeEach(async () => {
		await truncateAll();
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		const student = await makeUser();
		const course = await makeCourse({ instructorId: instructor.id });
		studentId = student.id;
		courseId = course.id;
	});

	afterAll(async () => {
		await testDb.$disconnect();
	});

	const insertRaw = (level: number, evidence: string | null) =>
		testDb.$executeRawUnsafe(
			`INSERT INTO concept_mastery (id, "studentId", "courseId", concept, "conceptKey", level, evidence, "updatedAt")
			 VALUES (gen_random_uuid()::text, $1, $2, 'Recursion', 'recursion', $3, ${
					evidence === null ? "NULL" : `'${evidence}'::"MasteryEvidence"`
				}, NOW())`,
			studentId,
			courseId,
			level,
		);

	it.each([0, 1])("refuses a direct insert at level %i", async (level) => {
		await expect(insertRaw(level, "CONVERSATION")).rejects.toThrow();
	});

	it.each([2, 3])("accepts level %i", async (level) => {
		await expect(insertRaw(level, "CONVERSATION")).resolves.toBe(1);
	});

	it("refuses a row that does not say how it was earned", async () => {
		await expect(insertRaw(2, null)).rejects.toThrow();
	});

	it("accepts the evidence a concept check produces", async () => {
		await expect(insertRaw(2, "APPLIED_CHECK")).resolves.toBe(1);
	});

	it("reports the level constraint from pg_constraint", async () => {
		const rows = await testDb.$queryRaw<{ definition: string }[]>`
			SELECT pg_get_constraintdef(oid) AS definition
			FROM pg_constraint
			WHERE conrelid = 'concept_mastery'::regclass AND contype = 'c'
		`;

		const definitions = rows.map((row) => row.definition).join(" | ");
		expect(definitions).toMatch(/level/);
		expect(definitions).toMatch(/2/);
		expect(definitions).toMatch(/3/);
	});

	it("keeps the rows it deleted, so the delete is reversible", async () => {
		const rows = await testDb.$queryRaw<{ exists: boolean }[]>`
			SELECT EXISTS (
				SELECT 1 FROM information_schema.tables
				WHERE table_name = 'concept_mastery_archive_le2'
			) AS exists
		`;

		expect(rows[0]?.exists).toBe(true);
	});
});
