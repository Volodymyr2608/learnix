import { beforeEach, describe, expect, it } from "vitest";
import { MasteryEvidence } from "@/generated/prisma";
import { conceptMasteryRepository } from "@/server/repositories/conceptMastery.repository";
import { testDb } from "@/test/db";
import { makeConceptMastery, makeCourse, makeUser } from "@/test/factories";

describe("ConceptMastery records how a level was earned", () => {
	let studentId: string;
	let courseId: string;

	beforeEach(async () => {
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		const student = await makeUser();
		const course = await makeCourse({ instructorId: instructor.id });
		studentId = student.id;
		courseId = course.id;
	});

	// NULL means "written before this change" — the pre-change population
	// security.md S8 needs isolated, and the reason the column is nullable.
	it("leaves a row written without evidence saying nothing", async () => {
		const row = await makeConceptMastery({
			studentId,
			courseId,
			concept: "Recursion",
			level: 3,
		});

		expect(row.evidence).toBeNull();
	});

	it("records the evidence a write was made with", async () => {
		const row = await conceptMasteryRepository.upsertMastery(
			studentId,
			courseId,
			"Recursion",
			3,
			MasteryEvidence.QUIZ_FIRST_PASS,
		);

		expect(row.evidence).toBe(MasteryEvidence.QUIZ_FIRST_PASS);
	});

	// Mastery is monotonic, and so is its provenance: the evidence must describe
	// the level the row actually holds, not the last write that touched it.
	it("keeps the evidence of the higher level when a lower write arrives", async () => {
		await conceptMasteryRepository.upsertMastery(
			studentId,
			courseId,
			"Recursion",
			3,
			MasteryEvidence.QUIZ_FIRST_PASS,
		);

		const row = await conceptMasteryRepository.upsertMastery(
			studentId,
			courseId,
			"Recursion",
			2,
			MasteryEvidence.CONVERSATION,
		);

		expect(row.level).toBe(3);
		expect(row.evidence).toBe(MasteryEvidence.QUIZ_FIRST_PASS);
	});

	it("replaces the evidence when the level actually rises", async () => {
		await conceptMasteryRepository.upsertMastery(
			studentId,
			courseId,
			"Recursion",
			2,
			MasteryEvidence.CONVERSATION,
		);

		const row = await conceptMasteryRepository.upsertMastery(
			studentId,
			courseId,
			"Recursion",
			3,
			MasteryEvidence.QUIZ_FIRST_PASS,
		);

		expect(row.level).toBe(3);
		expect(row.evidence).toBe(MasteryEvidence.QUIZ_FIRST_PASS);
	});

	it("leaves a pre-change row's NULL evidence alone when a lower write arrives", async () => {
		await makeConceptMastery({
			studentId,
			courseId,
			concept: "Recursion",
			level: 3,
		});

		const row = await conceptMasteryRepository.upsertMastery(
			studentId,
			courseId,
			"Recursion",
			2,
			MasteryEvidence.CONVERSATION,
		);

		expect(row.level).toBe(3);
		expect(row.evidence).toBeNull();
	});

	// The cutoff is `level = 3 AND evidence IS NULL`. A pre-change row that the
	// student then re-earns has left that population, and saying so is the whole
	// point of being able to identify it.
	it("attributes a pre-change row that is re-earned at the same level", async () => {
		await makeConceptMastery({
			studentId,
			courseId,
			concept: "Recursion",
			level: 3,
		});

		const row = await conceptMasteryRepository.upsertMastery(
			studentId,
			courseId,
			"Recursion",
			3,
			MasteryEvidence.QUIZ_RETRIED,
		);

		expect(row.level).toBe(3);
		expect(row.evidence).toBe(MasteryEvidence.QUIZ_RETRIED);
	});

	it("never overwrites evidence that already says something", async () => {
		await conceptMasteryRepository.upsertMastery(
			studentId,
			courseId,
			"Recursion",
			3,
			MasteryEvidence.QUIZ_FIRST_PASS,
		);

		const row = await conceptMasteryRepository.upsertMastery(
			studentId,
			courseId,
			"Recursion",
			3,
			MasteryEvidence.QUIZ_RETRIED,
		);

		expect(row.evidence).toBe(MasteryEvidence.QUIZ_FIRST_PASS);
	});

	it("still counts the pre-change population the cutoff has to cover", async () => {
		await makeConceptMastery({
			studentId,
			courseId,
			concept: "Recursion",
			level: 3,
		});
		await conceptMasteryRepository.upsertMastery(
			studentId,
			courseId,
			"Base case",
			3,
			MasteryEvidence.QUIZ_FIRST_PASS,
		);

		const unattributed = await testDb.conceptMastery.count({
			where: { level: 3, evidence: null },
		});

		expect(unattributed).toBe(1);
	});
});
