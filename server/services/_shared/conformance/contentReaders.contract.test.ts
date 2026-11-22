import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT_READERS } from "./contentReaders";

const walk = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) return walk(full);
		return /\.tsx?$/.test(full) && !/\.test\.tsx?$/.test(full) ? [full] : [];
	});

const code = (file: string): string =>
	readFileSync(file, "utf-8")
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/\/\/.*$/gm, "");

/** What counts as reading lesson content (AC-L7). */
const READS = [
	/searchCourseChunks\(|searchLessonChunks\(/,
	/lessonInsightsRepository\.findByLessonId\(/,
];
const LESSON_QUERY =
	/(lessonRepository\.\w+|db\.lesson\.\w+|tx\.lesson\.\w+)\(/;
const FULL_ROW =
	/lessonRepository\.find\w*\(\{(?:(?!\}\);)[\s\S]){0,600}?\binclude:/;

const isReader = (source: string): boolean =>
	READS.some((r) => r.test(source)) ||
	(LESSON_QUERY.test(source) && /\bcontent:\s*true/.test(source)) ||
	FULL_ROW.test(source);

const readers = (): string[] =>
	["server", "app/api"].flatMap(walk).filter((file) => isReader(code(file)));

const GATE = /lessonOpenedBy\(|openedBy|opened_lessons/;

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

	it("gates every reader marked opened", () => {
		const ungated = CONTENT_READERS.filter(
			(r) =>
				(r.gate === "opened" || r.gate === "definition") &&
				!GATE.test(code(r.file)),
		).map((r) => r.file);

		expect(ungated, ungated.join("\n")).toEqual([]);
	});

	it("is not vacuous", () => {
		expect(readers().length).toBeGreaterThanOrEqual(8);
	});
});
