import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The third flow-contract test, for the two surfaces that are neither graphs nor
 * the tutor: `quizAI` (a bounded retry loop around a two-tool agent) and
 * `lessonInsightsAI` (three prompts in parallel).
 *
 * `graphContract` enumerates registered nodes and `flowContract` enumerates a
 * closed tool set. Neither handle applies here, so completeness is pinned
 * against what these two surfaces do have on disk: their tool modules, their
 * chain modules, the tool names their factories declare, and the step modules
 * the stations name.
 */

const CONTRACT_DOC = "docs/specs/features/ai-flow-contracts/chain-contract.md";
const QUIZ_TOOLS_DIR = "server/services/quizAI/tools";
const INSIGHTS_CHAINS_DIR = "server/services/lessonInsightsAI/chains";

/**
 * Every step module a station is allowed to point at. A new one added without a
 * row is the drift this test exists to catch.
 */
const STEP_MODULES = [
	"quizAI.service.ts",
	"quizAI.agent.ts",
	"quizAI.validator.ts",
	"lessonInsightsAI.service.ts",
	"contentHash.ts",
	"lessonInsights.repository.ts",
];

const doc = (): string => readFileSync(CONTRACT_DOC, "utf-8");

/**
 * Anchored to a table cell, not a bare substring: a name mentioned only in the
 * prose or a failure matrix must not count as documented.
 */
const documentedInTable = (text: string, needle: string): boolean =>
	new RegExp(`\\|[^|\\n]*\`${needle}\`[^|\\n]*\\|`, "m").test(text);

const filesIn = (dir: string, suffix: string): string[] =>
	readdirSync(dir).filter((entry) => entry.endsWith(suffix));

/** The `name:` a tool factory declares, read from the source rather than listed here. */
const declaredToolNames = (): string[] =>
	filesIn(QUIZ_TOOLS_DIR, ".tool.ts").flatMap((file) => {
		const source = readFileSync(`${QUIZ_TOOLS_DIR}/${file}`, "utf-8");
		return [...source.matchAll(/name:\s*"([a-z_]+)"/g)].map(
			(match) => match[1] ?? "",
		);
	});

describe("AI chain contracts (quizAI, lessonInsightsAI)", () => {
	it("documents every quizAI tool module and the name it declares", () => {
		const text = doc();
		const onDisk = filesIn(QUIZ_TOOLS_DIR, ".tool.ts");
		const names = declaredToolNames();

		// Guards the reader: a directory that silently listed nothing would make
		// the assertions below pass while checking not one file.
		expect(onDisk.length).toBeGreaterThan(0);
		expect(names.length).toBe(onDisk.length);

		expect(
			onDisk.filter((file) => !text.includes(file)),
			`A quizAI tool module exists with no station row in ${CONTRACT_DOC}.`,
		).toEqual([]);

		expect(
			names.filter((name) => !documentedInTable(text, name)),
			`A tool is exposed to the model under a name no station row documents.`,
		).toEqual([]);
	});

	it("documents every lessonInsightsAI chain module", () => {
		const text = doc();
		const onDisk = filesIn(INSIGHTS_CHAINS_DIR, ".chain.ts");

		expect(onDisk.length).toBeGreaterThan(0);
		expect(
			onDisk.filter((file) => !text.includes(file)),
			`A chain module exists with no station row in ${CONTRACT_DOC}. A new chain is a new model call over the lesson body.`,
		).toEqual([]);
	});

	it("documents every step module the stations run through", () => {
		const text = doc();

		expect(
			STEP_MODULES.filter((module) => !text.includes(module)),
			"Add a station row citing each module above.",
		).toEqual([]);
	});

	it("states where an AI result may be persisted, once per surface", () => {
		const headings = [...doc().matchAll(/^### (.+)$/gm)].map((match) =>
			(match[1] ?? "").trim(),
		);

		// The two surfaces answer this in opposite directions — quizAI writes
		// nothing, lessonInsightsAI writes unconditionally — so one shared section
		// would have to blur exactly the difference worth documenting.
		expect(
			headings.filter((heading) =>
				heading.includes("where an AI result may be persisted"),
			).length,
			"Each surface needs its own persistence rule stated.",
		).toBe(2);
	});

	it("keeps the sixteen brief steps accounted for", () => {
		// Scoped to that one section: the station tables are also numbered, so an
		// unscoped row count silently sums them and can never be wrong.
		const section = /## The brief's sixteen flow steps[\s\S]*?(?=\n## )/.exec(
			doc(),
		)?.[0];
		expect(section, "the mapped-steps section is missing").toBeDefined();

		const rows = (section as string).match(/^\| \d+ \|/gm) ?? [];
		expect(
			rows.length,
			"Every step is either present on a surface or explicitly N/A with a reason — a dropped row is the drift this catches.",
		).toBe(16);
	});
});