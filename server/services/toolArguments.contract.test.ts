import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = "server/services";
// Any tool argument whose name reads like a row identifier. A tool that needs
// one binds it by closure at agent-construction time instead.
const ID_ARGUMENT =
	/\b(lessonId|courseId|studentId|instructorId|userId|generationId|quizId|sectionId|enrollmentId)\b\s*:/;

const walk = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) return walk(full);
		return full.endsWith(".tool.ts") && !full.endsWith(".test.ts")
			? [full]
			: [];
	});

/**
 * "We do not validate the identifier the model gives us — we do not give the
 * model the ability to name one." An id the model can name is an id an injected
 * instruction can change, and tool handlers rarely re-check ownership.
 *
 * Read from the `schema:` block down, since a schema is the only place a
 * model-supplied argument can appear. Like every contract test here this catches
 * the omission, not the logic: it cannot tell whether a closure-bound id is the
 * *right* one, only that the model was not asked for it.
 */
describe("AI tool arguments", () => {
	it("no tool schema accepts a row identifier", () => {
		const offenders = walk(join(process.cwd(), ROOT))
			.map((abs) => abs.slice(process.cwd().length + 1))
			.filter((rel) => {
				const source = readFileSync(rel, "utf-8");
				const schemaIndex = source.indexOf("schema:");
				if (schemaIndex === -1) return false;
				return ID_ARGUMENT.test(source.slice(schemaIndex));
			});

		expect(offenders).toEqual([]);
	});
});
