import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT_READERS } from "./contentReaders";
import { functionBody, GATE, isReader } from "./contentReaders.detect";

const walk = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) return walk(full);
		return /\.tsx?$/.test(full) && !/\.test\.tsx?$/.test(full) ? [full] : [];
	});

const source = (file: string): string => readFileSync(file, "utf-8");

const readers = (): string[] =>
	["server", "app", "lib"]
		.flatMap(walk)
		.filter((file) => isReader(source(file)));

describe("the reader detector catches the shapes that return lesson content", () => {
	it.each([
		[
			"a select with content",
			"lessonRepository.findFirst({ where: { id }, select: { content: true } })",
		],
		["a full row, no select", "lessonRepository.findFirst({ where: { id } })"],
		["a full row by id", "lessonRepository.findOne(id)"],
		["a Prisma full row", "db.lesson.findMany({ where: { sectionId } })"],
		[
			"lessons through a relation, true",
			"courseRepository.findFirst({ include: { sections: { include: { lessons: true } } } })",
		],
		[
			"lessons through a relation, no select",
			"db.section.findMany({ include: { lessons: { orderBy: { order: 'asc' } } } })",
		],
		[
			"lessons through a relation selecting content",
			"enrollmentRepository.findFirst({ select: { course: { select: { sections: { select: { lessons: { select: { content: true } } } } } } } })",
		],
		["any study-guide read", "lessonInsightsRepository.findSummary(lessonId)"],
		["a chunk search", "embeddingRepository.searchLessonChunks(id, v, 4)"],
		["raw SQL on content", "SELECT l.content FROM lessons l"],
	])("%s", (_label, planted) => {
		expect(isReader(planted)).toBe(true);
	});

	it.each([
		[
			"a where-clause relation filter",
			"enrollmentRepository.findFirst({ where: { course: { sections: { some: { lessons: { some: { id } } } } } } })",
		],
		[
			"lessons selecting only id and title",
			"db.section.findMany({ include: { lessons: { where: { deletedAt: null }, select: { id: true, title: true } } } })",
		],
		[
			"an aggregate over a lessons column",
			"db.studyArchive.aggregate({ _sum: { lessons: true } })",
		],
		[
			"a custom repository method",
			"lessonRepository.findOrderedLessonIdsByCourseIds(ids)",
		],
		["a commented-out read", "// lessonRepository.findOne(id)"],
	])("not %s", (_label, planted) => {
		expect(isReader(planted)).toBe(false);
	});

	it("finds the gate inside the named function, not elsewhere in the file", () => {
		const planted = `
			async getForLesson(id: string, userId: string) {
				return db.lessonInsights.findFirst({ where: { lessonId: id } });
			}
			private async logIfUnopened(id: string, userId: string) {
				return db.lesson.count({ where: { NOT: lessonOpenedBy(userId) } });
			}`;

		expect(GATE.test(functionBody(planted, "getForLesson") ?? "")).toBe(false);
		expect(GATE.test(functionBody(planted, "logIfUnopened") ?? "")).toBe(true);
	});
});

describe("every lesson-content reader is listed with its gate (AC-L7, AI-C7)", () => {
	it("lists every reader the source contains", () => {
		const listed = CONTENT_READERS.map((r) => r.file);
		const unlisted = readers().filter((file) => !listed.includes(file));

		expect(unlisted, unlisted.join("\n")).toEqual([]);
	});

	it("lists no file that has stopped reading content", () => {
		const found = readers();
		const stale = CONTENT_READERS.map((r) => r.file).filter(
			(f) => !found.includes(f),
		);

		expect(stale, stale.join("\n")).toEqual([]);
	});

	it("gates every opened or definition reader inside the function it names", () => {
		const ungated = CONTENT_READERS.filter(
			(r) => r.gate === "opened" || r.gate === "definition",
		)
			.filter((r) => {
				const body = r.symbol ? functionBody(source(r.file), r.symbol) : null;
				return body === null || !GATE.test(body);
			})
			.map((r) => `${r.file} ${r.symbol ?? "(no symbol)"}`);

		expect(ungated, ungated.join("\n")).toEqual([]);
	});

	it("is not vacuous", () => {
		expect(readers().length).toBeGreaterThanOrEqual(12);
	});
});
