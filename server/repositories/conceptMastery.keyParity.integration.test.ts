import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { MasteryEvidence } from "@/generated/prisma";
import { conceptMasteryRepository } from "@/server/repositories/conceptMastery.repository";
import { conceptKey } from "@/server/services/_shared/concepts/conceptKey";
import { testDb, truncateAll } from "@/test/db";
import { makeConceptMastery, makeCourse, makeUser } from "@/test/factories";

const NBSP = " ";
const THIN_SPACE = " ";
const COMBINING_ACUTE = "́";

/**
 * The inputs on which `toLowerCase()` / `\s` and `lower()` / `[[:space:]]` are
 * known to disagree, plus the ordinary cases. If TypeScript ever folds more
 * aggressively than the backfill, two distinct rows map to one key and a write
 * binds to the wrong row.
 */
const CORPUS = [
	"API Routes",
	"api routes",
	"  API   Routes ",
	"API\tRoutes",
	"API\n\nRoutes",
	"API\vRoutes",
	"API\fRoutes",
	"API\r\nRoutes",
	`API${NBSP}Routes`,
	`${NBSP}API Routes${NBSP}`,
	`API${THIN_SPACE}Routes`,
	"İstanbul",
	"İ",
	"ß",
	"Straße",
	"Café",
	`Cafe${COMBINING_ACUTE}`,
	"C#",
	"C",
	"Server Components",
	"ÄÖÜ",
	"ЖУРНАЛ",
	"日本語",
	"",
	"   ",
];

const sqlConceptKey = async (raw: string): Promise<string> => {
	const rows = await testDb.$queryRaw<
		{ key: string }[]
	>`SELECT concept_key(${raw}) AS key`;
	const row = rows[0];
	if (!row) throw new Error("concept_key returned no row");
	return row.key;
};

describe("conceptKey parity between TypeScript and the SQL backfill", () => {
	afterAll(async () => {
		await testDb.$disconnect();
	});

	it.each(CORPUS)("agrees on %j", async (raw) => {
		expect(await sqlConceptKey(raw)).toBe(conceptKey(raw));
	});

	it("agrees on every distinct concept value stored in the database", async () => {
		await truncateAll();
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		const student = await makeUser();
		const course = await makeCourse({ instructorId: instructor.id });

		// Only the names that do not collide with one another, since the table now
		// holds one row per key.
		const stored = ["API Routes", "Middleware", "İstanbul", "Straße", "C#"];
		for (const concept of stored) {
			await makeConceptMastery({
				studentId: student.id,
				courseId: course.id,
				concept,
				level: 2,
			});
		}

		const rows = await testDb.conceptMastery.findMany({
			select: { concept: true, conceptKey: true },
		});
		expect(rows).toHaveLength(stored.length);
		for (const row of rows) {
			expect(row.conceptKey).toBe(conceptKey(row.concept));
			expect(await sqlConceptKey(row.concept)).toBe(row.conceptKey);
		}
	});
});

describe("colliding spellings resolve to one row", () => {
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

	it("merges `API Routes` @2 and `api routes` @3 into one row at level 3", async () => {
		await conceptMasteryRepository.upsertMastery(
			studentId,
			courseId,
			"API Routes",
			2,
			MasteryEvidence.CONVERSATION,
		);
		await conceptMasteryRepository.upsertMastery(
			studentId,
			courseId,
			"api routes",
			3,
			MasteryEvidence.QUIZ_FIRST_PASS,
		);

		const rows = await testDb.conceptMastery.findMany({ where: { studentId } });
		expect(rows).toHaveLength(1);
		expect(rows[0]?.level).toBe(3);
		expect(rows[0]?.evidence).toBe(MasteryEvidence.QUIZ_FIRST_PASS);
		expect(rows[0]?.conceptKey).toBe("api routes");
	});

	it("keeps the level when the colliding spelling arrives lower", async () => {
		await conceptMasteryRepository.upsertMastery(
			studentId,
			courseId,
			"api   routes",
			3,
			MasteryEvidence.QUIZ_FIRST_PASS,
		);
		await conceptMasteryRepository.upsertMastery(
			studentId,
			courseId,
			"API Routes",
			2,
			MasteryEvidence.CONVERSATION,
		);

		const rows = await testDb.conceptMastery.findMany({ where: { studentId } });
		expect(rows).toHaveLength(1);
		expect(rows[0]?.level).toBe(3);
		expect(rows[0]?.evidence).toBe(MasteryEvidence.QUIZ_FIRST_PASS);
	});

	it("keeps `C#` and `C` apart", async () => {
		await conceptMasteryRepository.upsertMastery(
			studentId,
			courseId,
			"C#",
			2,
			MasteryEvidence.CONVERSATION,
		);
		await conceptMasteryRepository.upsertMastery(
			studentId,
			courseId,
			"C",
			2,
			MasteryEvidence.CONVERSATION,
		);

		const rows = await testDb.conceptMastery.findMany({ where: { studentId } });
		expect(rows).toHaveLength(2);
	});

	it("stores the conceptKey alongside the spelling the caller supplied", async () => {
		await conceptMasteryRepository.upsertMastery(
			studentId,
			courseId,
			"  API   Routes ",
			2,
			MasteryEvidence.CONVERSATION,
		);

		const row = await testDb.conceptMastery.findFirst({ where: { studentId } });
		expect(row?.conceptKey).toBe("api routes");
	});
});
