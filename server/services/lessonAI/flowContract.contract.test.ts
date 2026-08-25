import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALLOWED_TOOL_NAMES } from "./toolPolicy";

/**
 * The chain counterpart to `graphContract.contract.test.ts` (ai-flow-contracts).
 *
 * The graph flows get their completeness for free: `graph.ts` registers every
 * node, so the test can enumerate them. A ReAct chain has no such registry —
 * which is the honest reason `ai-flow-contracts` left the tutor out. Completeness
 * here is pinned against the two things that *are* enumerable, the closed tool
 * set and the tool directory, plus the modules each station names.
 */

const CONTRACT_DOC =
	"docs/specs/features/ai-tutor-guardrails/flow-contract.md";
const TOOLS_DIR = "server/services/lessonAI/tools";

/**
 * Every step module a station is allowed to point at. A new one added without a
 * row is the drift this test exists to catch.
 */
const STEP_MODULES = [
	"lessonAI.service.ts",
	"lessonAI.agent.ts",
	"toolPolicy.ts",
	"validateReply.ts",
];

const doc = (): string => readFileSync(CONTRACT_DOC, "utf-8");

/**
 * Anchored to a table cell, not a bare substring: a name mentioned only in the
 * prose or the failure matrix must not count as documented, and `search_across`
 * must not satisfy the row for `search_across_course`.
 */
const documentedInTable = (text: string, needle: string): boolean =>
	new RegExp(`\\|[^|\\n]*\`${needle}\`[^|\\n]*\\|`, "m").test(text);

describe("lesson tutor flow contract (Area 3)", () => {
	it("documents every tool in the closed set", () => {
		const text = doc();
		const missing = ALLOWED_TOOL_NAMES.filter(
			(name) => !documentedInTable(text, name),
		);

		expect(
			missing,
			`Add a station row to ${CONTRACT_DOC} for each tool listed above.`,
		).toEqual([]);
	});

	it("documents every tool module on disk", () => {
		const text = doc();
		const onDisk = readdirSync(TOOLS_DIR).filter((entry) =>
			entry.endsWith(".tool.ts"),
		);

		// Guards the reader: a directory that silently listed nothing would make
		// the assertion below pass while checking not one file.
		expect(onDisk.length).toBe(ALLOWED_TOOL_NAMES.length);

		const missing = onDisk.filter((file) => !text.includes(file));
		expect(
			missing,
			`A tool module exists with no row in ${CONTRACT_DOC}.`,
		).toEqual([]);
	});

	it("documents every step module the stations run through", () => {
		const text = doc();
		const missing = STEP_MODULES.filter((module) => !text.includes(module));

		expect(missing, `Add a station row citing each module above.`).toEqual([]);
	});

	it("keeps the sixteen brief steps accounted for", () => {
		// Scoped to that one section: the station table is also numbered, so an
		// unscoped row count silently sums the two and can never be wrong.
		const section = /## The brief's sixteen flow steps[\s\S]*?(?=\n## )/.exec(
			doc(),
		)?.[0];
		expect(section, "the mapped-steps section is missing").toBeDefined();

		const rows = (section as string).match(/^\| \d+ \|/gm) ?? [];
		expect(
			rows.length,
			"Every step is either present or explicitly N/A with a reason — a dropped row is the drift this catches.",
		).toBe(16);
	});
});