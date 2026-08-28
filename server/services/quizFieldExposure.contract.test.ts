import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = "server/services";

/** A file defines a tool, whatever it is named — see toolArguments.contract.test.ts. */
const DEFINES_TOOL = /\btool\(/;

/**
 * Where embedding inputs are built. A directory rather than a name pattern:
 * matching on `embed*(` caught every *caller* of the embedding service —
 * including the student lesson read, whose `options: true` is a projection to a
 * student, which is required, not a leak. The question here is only what the
 * embedder itself is handed.
 */
const EMBEDDING_ROOT = "server/services/embeddings";

/**
 * The two quiz fields that must never reach a model: the key itself, and the
 * option set — which, handed to a model that also sees the lesson, is most of
 * the way to reconstructing the key.
 *
 * Matched as a projection (`correct: q.correct`, `q.correct,`, `correct: true`),
 * not as the bare word: `isCorrect` is the attempt's grade and legitimately
 * travels, and prose about "the correct answer" is not a data path.
 */
const PROJECTS_QUIZ_SECRET =
	/(?<![A-Za-z])(correct|options)\s*:\s*(true|\w+\.(correct|options))|(?<![A-Za-z.])q(uiz)?\.(correct|options)\b/;

const walk = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) return walk(full);
		return full.endsWith(".ts") && !full.endsWith(".test.ts") ? [full] : [];
	});

const sources = () =>
	walk(join(process.cwd(), ROOT))
		.map((abs) => abs.slice(process.cwd().length + 1))
		.map((rel) => ({ rel, source: readFileSync(rel, "utf-8") }));

/**
 * The model-side twin of the student-surface sweep. A student cannot read the
 * key from a response any more; this is the other door — a tool or an embedding
 * that hands it to a model, which will then say it out loud when asked.
 *
 * The AI path is closed by accident today: quizzes are not embedded and no tool
 * projects the key. That is a property of a few files that happen not to read
 * `quizRepository`, and the next "give the tutor quiz awareness" ticket reopens
 * it through a door nothing names. This names it.
 */
describe("no quiz field but the question reaches a model", () => {
	it("no tool definition projects the answer key or the option set", () => {
		const offenders = sources()
			.filter(
				({ source }) =>
					DEFINES_TOOL.test(source) && PROJECTS_QUIZ_SECRET.test(source),
			)
			.map(({ rel }) => rel);

		expect(offenders, offenders.join("\n")).toEqual([]);
	});

	it("no embedding source builder projects them either", () => {
		const builders = sources().filter(({ rel }) =>
			rel.startsWith(EMBEDDING_ROOT),
		);
		const offenders = builders
			.filter(({ source }) => PROJECTS_QUIZ_SECRET.test(source))
			.map(({ rel }) => rel);

		// Quizzes are not embedded at all today — the stronger statement, and the
		// one that would have to be edited to change it.
		expect(offenders, offenders.join("\n")).toEqual([]);
		expect(builders.length).toBeGreaterThanOrEqual(2);
		expect(
			builders.filter(({ source }) => /quizRepository/.test(source)),
		).toEqual([]);
	});

	// Without this the scan passes by matching nothing at all — the failure mode
	// of every regex-based contract test.
	it("recognises a projection when it sees one", () => {
		expect(PROJECTS_QUIZ_SECRET.test("correct: q.correct,")).toBe(true);
		expect(PROJECTS_QUIZ_SECRET.test("select: { correct: true }")).toBe(true);
		expect(PROJECTS_QUIZ_SECRET.test("options: quiz.options,")).toBe(true);
		expect(
			PROJECTS_QUIZ_SECRET.test("return quizzes.map((q) => q.correct)"),
		).toBe(true);
	});

	// And does not fire on the things that legitimately travel: an attempt's
	// grade, and prose.
	it("does not fire on the attempt grade or on prose", () => {
		expect(PROJECTS_QUIZ_SECRET.test("isCorrect: attempt.isCorrect,")).toBe(
			false,
		);
		expect(
			PROJECTS_QUIZ_SECRET.test("// tells the student the correct answer"),
		).toBe(false);
	});

	it("scans the files it claims to", () => {
		const tools = sources().filter(({ source }) => DEFINES_TOOL.test(source));

		expect(tools.length).toBeGreaterThanOrEqual(8);
		expect(tools.map(({ rel }) => rel)).toContain(
			"server/services/quizAI/tools/getExistingQuizzes.tool.ts",
		);
	});
});
