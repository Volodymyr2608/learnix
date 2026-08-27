import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Floors that apply to every golden set, whatever surface it belongs to.
 *
 * A two-row dataset cannot produce a meaningful score: every result is 0%, 50%
 * or 100%, so a threshold is decoration and a regression is indistinguishable
 * from a coin landing badly. Three of these sets sat at two rows for months
 * without anything saying so, which is the argument for checking it here rather
 * than remembering it per surface.
 */

const DATASETS_DIR = "evals/datasets";

/** The smallest set on which a percentage says anything at all. */
const MIN_ROWS = 5;

const walk = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) return walk(full);
		return full.endsWith(".jsonl") ? [full] : [];
	});

const rowsOf = (file: string): unknown[] =>
	readFileSync(file, "utf-8")
		.split("\n")
		.filter((line) => line.trim())
		.map((line, i) => {
			try {
				return JSON.parse(line);
			} catch (cause) {
				throw new Error(`${file} line ${i + 1} is not valid JSON`, { cause });
			}
		});

const files = walk(DATASETS_DIR);

describe("every eval dataset", () => {
	it("finds dataset files to check", () => {
		expect(files.length).toBeGreaterThan(0);
	});

	it.each(files)("%s parses as JSONL", (file) => {
		expect(() => rowsOf(file)).not.toThrow();
	});

	it.each(files)("%s holds enough rows to score", (file) => {
		expect(rowsOf(file).length).toBeGreaterThanOrEqual(MIN_ROWS);
	});

	/**
	 * Ids are what a failure report can name. A set without them reports
	 * `row-3`, which says nothing once the file is edited.
	 */
	it.each(files)("%s gives every row a unique id", (file) => {
		const ids = rowsOf(file)
			.map((row) => (row as { id?: unknown }).id)
			.filter((id): id is string => typeof id === "string");

		expect(ids).toHaveLength(rowsOf(file).length);
		expect(new Set(ids).size).toBe(ids.length);
	});
});
