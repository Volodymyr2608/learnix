import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { quizAttemptRepository } from "@/server/repositories/quizAttempt.repository";
import { testDb } from "@/test/db";
import {
	makeCourse,
	makeLesson,
	makeQuiz,
	makeQuizAttempt,
	makeSection,
	makeUser,
} from "@/test/factories";

/**
 * The dedupe statement is irreversible, so it is tested rather than trusted —
 * against a clone of the table, using the statement as it is actually written in
 * the migration. Reading it from disk is what keeps this test honest: an edit to
 * the migration's ORDER BY changes which row survives, and a copy of the SQL in
 * here would keep passing.
 */
const dedupeStatement = (): string => {
	const dir = readdirSync("prisma/migrations").find((name) =>
		name.endsWith("_quiz_attempt_counter"),
	);
	if (!dir) throw new Error("quiz_attempt_counter migration not found");
	const sql = readFileSync(
		join("prisma/migrations", dir, "migration.sql"),
		"utf8",
	);
	const start = sql.indexOf(">>> dedupe");
	const end = sql.indexOf("<<< dedupe");
	if (start === -1 || end === -1) {
		throw new Error("dedupe markers missing from the migration");
	}
	return sql.slice(sql.indexOf("\n", start) + 1, sql.lastIndexOf("\n", end));
};

const runDedupeOnProbe = async (): Promise<void> => {
	const statements = dedupeStatement()
		.replaceAll("quiz_attempts_archive_dedupe", "dedupe_probe_archive")
		.replaceAll("quiz_attempts", "dedupe_probe")
		.split(";")
		.map((s) => s.trim())
		.filter(Boolean);
	for (const statement of statements) {
		await testDb.$executeRawUnsafe(statement);
	}
};

type ProbeRow = {
	id: string;
	quizId: string;
	studentId: string;
	isCorrect: boolean;
};

const seedProbeRow = async (
	row: ProbeRow & { createdAt: string },
): Promise<void> => {
	await testDb.$executeRawUnsafe(
		`INSERT INTO dedupe_probe (id, "quizId", "studentId", "selectedAnswer", "isCorrect", "createdAt", "updatedAt")
		 VALUES ($1, $2, $3, 'A', $4, $5::timestamp, $5::timestamp)`,
		row.id,
		row.quizId,
		row.studentId,
		row.isCorrect,
		row.createdAt,
	);
};

describe("quiz_attempt_counter migration — collapsing duplicate pairs", () => {
	beforeEach(async () => {
		await testDb.$executeRawUnsafe("DROP TABLE IF EXISTS dedupe_probe");
		await testDb.$executeRawUnsafe("DROP TABLE IF EXISTS dedupe_probe_archive");
		await testDb.$executeRawUnsafe(
			"CREATE TABLE dedupe_probe (LIKE quiz_attempts INCLUDING DEFAULTS)",
		);
	});

	afterAll(async () => {
		await testDb.$executeRawUnsafe("DROP TABLE IF EXISTS dedupe_probe");
		await testDb.$executeRawUnsafe("DROP TABLE IF EXISTS dedupe_probe_archive");
		await testDb.$disconnect();
	});

	it("keeps the correct row even when a wrong one is newer", async () => {
		await seedProbeRow({
			id: "wrong-newest",
			quizId: "q1",
			studentId: "s1",
			isCorrect: false,
			createdAt: "2026-01-03 10:00:00",
		});
		await seedProbeRow({
			id: "right-older",
			quizId: "q1",
			studentId: "s1",
			isCorrect: true,
			createdAt: "2026-01-01 10:00:00",
		});

		await runDedupeOnProbe();

		const survivors = await testDb.$queryRawUnsafe<{ id: string }[]>(
			"SELECT id FROM dedupe_probe",
		);
		expect(survivors.map((r) => r.id)).toEqual(["right-older"]);
	});

	it("keeps the newest row when no attempt was correct", async () => {
		await seedProbeRow({
			id: "wrong-older",
			quizId: "q2",
			studentId: "s1",
			isCorrect: false,
			createdAt: "2026-01-01 10:00:00",
		});
		await seedProbeRow({
			id: "wrong-newest",
			quizId: "q2",
			studentId: "s1",
			isCorrect: false,
			createdAt: "2026-01-05 10:00:00",
		});

		await runDedupeOnProbe();

		const survivors = await testDb.$queryRawUnsafe<{ id: string }[]>(
			"SELECT id FROM dedupe_probe",
		);
		expect(survivors.map((r) => r.id)).toEqual(["wrong-newest"]);
	});

	it("leaves distinct pairs alone and archives only what it deletes", async () => {
		await seedProbeRow({
			id: "keep-a",
			quizId: "q3",
			studentId: "s1",
			isCorrect: false,
			createdAt: "2026-01-01 10:00:00",
		});
		await seedProbeRow({
			id: "keep-b",
			quizId: "q3",
			studentId: "s2",
			isCorrect: false,
			createdAt: "2026-01-01 10:00:00",
		});
		await seedProbeRow({
			id: "loser",
			quizId: "q3",
			studentId: "s1",
			isCorrect: false,
			createdAt: "2025-12-01 10:00:00",
		});

		await runDedupeOnProbe();

		const survivors = await testDb.$queryRawUnsafe<{ id: string }[]>(
			"SELECT id FROM dedupe_probe ORDER BY id",
		);
		const archived = await testDb.$queryRawUnsafe<{ id: string }[]>(
			"SELECT id FROM dedupe_probe_archive ORDER BY id",
		);
		expect(survivors.map((r) => r.id)).toEqual(["keep-a", "keep-b"]);
		expect(archived.map((r) => r.id)).toEqual(["loser"]);
	});
});

describe("QuizAttempt — one row per (quiz, student)", () => {
	let quizId: string;
	let studentId: string;

	beforeEach(async () => {
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		const student = await makeUser();
		const course = await makeCourse({ instructorId: instructor.id });
		const section = await makeSection({ courseId: course.id });
		const lesson = await makeLesson({ sectionId: section.id });
		const quiz = await makeQuiz({ lessonId: lesson.id });
		quizId = quiz.id;
		studentId = student.id;
	});

	it("refuses a second row for the same pair", async () => {
		await makeQuizAttempt({ quizId, studentId });

		await expect(makeQuizAttempt({ quizId, studentId })).rejects.toThrow(
			/Unique constraint/i,
		);
	});

	it("records an unknown attempt count as NULL rather than inventing one", async () => {
		const attempt = await makeQuizAttempt({ quizId, studentId });

		expect(attempt.attemptCount).toBeNull();
	});

	it("counts the first graded attempt as one", async () => {
		const result = await quizAttemptRepository.recordAttempt(
			quizId,
			studentId,
			"B",
			false,
			3,
		);

		expect(result.outcome).toBe("recorded");
		expect(result.attempt).toMatchObject({
			attemptCount: 1,
			isCorrect: false,
			selectedAnswer: "B",
		});
	});

	it("counts a retry on the same row, and does not open a second one", async () => {
		await quizAttemptRepository.recordAttempt(quizId, studentId, "B", false, 3);
		const second = await quizAttemptRepository.recordAttempt(
			quizId,
			studentId,
			"A",
			true,
			3,
		);

		const rows = await testDb.quizAttempt.findMany({
			where: { quizId, studentId },
		});
		expect(second.attempt).toMatchObject({ attemptCount: 2, isCorrect: true });
		expect(rows).toHaveLength(1);
	});

	it("leaves a legacy row's unknown count unknown, and grants it the cap", async () => {
		const legacy = await makeQuizAttempt({
			quizId,
			studentId,
			isCorrect: false,
		});
		expect(legacy.attemptCount).toBeNull();

		const result = await quizAttemptRepository.recordAttempt(
			quizId,
			studentId,
			"B",
			false,
			3,
		);

		expect(result.outcome).toBe("recorded");
		expect(result.attempt.attemptCount).toBeNull();
		expect(result.attempt.updatedAt.getTime()).toBeGreaterThan(
			legacy.updatedAt.getTime(),
		);
	});

	it("refuses to touch a row that is already correct, and names that outcome", async () => {
		const correct = await quizAttemptRepository.recordAttempt(
			quizId,
			studentId,
			"A",
			true,
			3,
		);

		const second = await quizAttemptRepository.recordAttempt(
			quizId,
			studentId,
			"B",
			false,
			3,
		);

		expect(second.outcome).toBe("already_correct");
		expect(second.attempt).toMatchObject({
			isCorrect: true,
			selectedAnswer: "A",
			attemptCount: correct.attempt.attemptCount,
		});
	});

	it("writes nothing once the cap is spent, and names that outcome", async () => {
		await quizAttemptRepository.recordAttempt(quizId, studentId, "B", false, 1);

		const second = await quizAttemptRepository.recordAttempt(
			quizId,
			studentId,
			"A",
			true,
			1,
		);

		const row = await testDb.quizAttempt.findFirstOrThrow({
			where: { quizId, studentId },
		});
		expect(second.outcome).toBe("capped");
		expect(row).toMatchObject({
			attemptCount: 1,
			isCorrect: false,
			selectedAnswer: "B",
		});
	});

	it("leaves one row and one loser when two attempts race", async () => {
		const [first, second] = await Promise.all([
			quizAttemptRepository.recordAttempt(quizId, studentId, "A", true, 3),
			quizAttemptRepository.recordAttempt(quizId, studentId, "A", true, 3),
		]);

		const rows = await testDb.quizAttempt.findMany({
			where: { quizId, studentId },
		});
		expect(rows).toHaveLength(1);
		expect(
			[first, second].filter((r) => r.outcome === "recorded"),
		).toHaveLength(1);
		expect(
			[first, second].filter((r) => r.outcome === "already_correct"),
		).toHaveLength(1);
	});

	it("moves updatedAt when the row is written again, and leaves createdAt pinned", async () => {
		const created = await makeQuizAttempt({
			quizId,
			studentId,
			isCorrect: false,
		});

		const updated = await testDb.quizAttempt.update({
			where: { id: created.id },
			data: { selectedAnswer: "B" },
		});

		expect(updated.createdAt.getTime()).toBe(created.createdAt.getTime());
		expect(updated.updatedAt.getTime()).toBeGreaterThan(
			created.updatedAt.getTime(),
		);
	});
});
