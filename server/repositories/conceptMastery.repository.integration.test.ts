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
			1,
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
			1,
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
			1,
			MasteryEvidence.CONVERSATION,
		);
		await conceptMasteryRepository.upsertMastery(
			studentId,
			courseId,
			"Recursion",
			2,
			MasteryEvidence.CONVERSATION,
		);

		const count = await testDb.conceptMastery.count({
			where: { studentId, courseId, concept: "Recursion" },
		});
		expect(count).toBe(1);
	});
});
