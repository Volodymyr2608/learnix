import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = "server/services";
// A file defines a tool, whatever it is named. Matching on `tool(` rather than a
// `.tool.ts` suffix matters: all four courseAI tools live at
// courseAI/tools/<name>.ts with no suffix, and a filename convention is not a
// contract.
const DEFINES_TOOL = /\btool\(/;
// Any argument that could carry a row identifier. `\bid\b` catches the aliased
// form, and the trailing-Id rule is case-insensitive so `targetLessonID` counts.
const ID_ARGUMENT = /\b(\w*[iI]d|id)\s*:\s*z\./;

const walk = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) return walk(full);
		return full.endsWith(".ts") && !full.endsWith(".test.ts") ? [full] : [];
	});

/**
 * "We do not validate the identifier the model gives us — we do not give the
 * model the ability to name one." An id the model can name is an id an injected
 * instruction can change, and tool handlers rarely re-check ownership.
 *
 * The whole file is scanned, not the text after `schema:`, because a schema is
 * routinely built as a const above the key (validateCurriculumCoherence does
 * exactly that). Known limit, in the spirit of the other contract tests here:
 * this proves no id-shaped key is *declared* in a tool file — it cannot prove a
 * closure-bound id is the right one, and a schema assembled in another module
 * would still slip past. Runtime enumeration of each agent's bound tools is the
 * stronger version if this ever needs to be airtight.
 */
describe("AI tool arguments", () => {
	it("no tool definition accepts a row identifier", () => {
		const offenders = walk(join(process.cwd(), ROOT))
			.map((abs) => abs.slice(process.cwd().length + 1))
			.filter((rel) => {
				const source = readFileSync(rel, "utf-8");
				return DEFINES_TOOL.test(source) && ID_ARGUMENT.test(source);
			});

		expect(offenders).toEqual([]);
	});
});
